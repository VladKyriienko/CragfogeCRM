import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  and,
  eq,
  exportJobs,
  fieldDefinitions,
  isNull,
  objectDefinitions,
  sql,
  users,
  withWorkspace,
} from '@cragfoge/db';
import {
  filterGroupSchema,
  recordSortSchema,
  type FieldDefinitionDto,
  type FilterGroup,
  type RecordSort,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { shouldOwnQueues, shouldRunWorkers, type Env } from '../config/env';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.types';
import { compileFilter, compileSort } from '../records/filter-sql';
import type { StorageProvider } from '../storage/storage.types';
import { ENV, REDIS, STORAGE } from '../tokens';
import { buildCsv } from './csv';

export type ExportJobPayload = {
  workspaceId: string;
  jobId: string;
};

/** Safety cap on rows per export while this feature is new. */
const MAX_EXPORT_ROWS = 50_000;
const QUEUE_NAME = 'record-export';

@Injectable()
export class ExportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorkerService.name);
  private queue: Queue<ExportJobPayload> | undefined;
  private worker: Worker<ExportJobPayload> | undefined;
  private connection: IORedis | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: IORedis,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') {
      return;
    }
    const ownQueue = shouldOwnQueues(this.env);
    const runWorker = shouldRunWorkers(this.env);
    if (!ownQueue && !runWorker) {
      return;
    }
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    if (ownQueue) {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    }
    if (runWorker) {
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          await this.process(job.data);
        },
        { connection: this.connection.duplicate() },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error(`Export job ${job?.id} failed: ${error.message}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(payload: ExportJobPayload): Promise<void> {
    if (!this.queue) {
      // In tests / when the queue is disabled, run inline so callers can
      // observe the finished job immediately.
      await this.process(payload);
      return;
    }
    await this.queue.add('export', payload, {
      jobId: payload.jobId,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  private async process(payload: ExportJobPayload): Promise<void> {
    const { workspaceId, jobId } = payload;

    const context = await withWorkspace(workspaceId, async (tx) => {
      const [job] = await tx.select().from(exportJobs).where(eq(exportJobs.id, jobId)).limit(1);
      if (!job) {
        return null;
      }
      const [object] = await tx
        .select()
        .from(objectDefinitions)
        .where(eq(objectDefinitions.id, job.objectId))
        .limit(1);
      if (!object) {
        return null;
      }
      const fieldRows = await tx
        .select()
        .from(fieldDefinitions)
        .where(
          and(eq(fieldDefinitions.objectId, job.objectId), isNull(fieldDefinitions.deletedAt)),
        );
      const [owner] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, job.ownerId))
        .limit(1);

      await tx.update(exportJobs).set({ status: 'processing' }).where(eq(exportJobs.id, jobId));

      return { job, object, fieldRows, ownerEmail: owner?.email };
    });

    if (!context) {
      this.logger.warn(`Export job ${jobId} or its object no longer exists`);
      return;
    }
    const { job, object, fieldRows, ownerEmail } = context;

    try {
      const fields: FieldDefinitionDto[] = fieldRows.map((row) => ({
        id: row.id,
        objectId: row.objectId,
        apiName: row.apiName,
        label: row.label,
        type: row.type,
        required: row.required,
        isUnique: row.isUnique,
        isSystem: row.isSystem,
        options: row.options ?? {},
        position: row.position,
        isIndexed: row.isIndexed,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      const filter: FilterGroup | undefined = job.filter
        ? filterGroupSchema.parse(job.filter)
        : undefined;
      const sort: RecordSort | undefined = job.sort ? recordSortSchema.parse(job.sort) : undefined;
      const columns = job.columns;

      const rows = await withWorkspace(workspaceId, async (tx) => {
        const conditions: ReturnType<typeof sql>[] = [
          sql`object_id = ${job.objectId}`,
          sql`deleted_at is null`,
        ];
        const compiled = compileFilter(filter, fields);
        if (compiled.sql) {
          conditions.push(compiled.sql);
        }
        for (const relation of compiled.relationExists) {
          const existsSql =
            relation.toRecordIds.length === 0
              ? sql`exists (
                  select 1 from record_relations rr
                  where rr.from_record_id = records.id and rr.field_id = ${relation.fieldId}
                )`
              : sql`exists (
                  select 1 from record_relations rr
                  where rr.from_record_id = records.id
                    and rr.field_id = ${relation.fieldId}
                    and rr.to_record_id in ${relation.toRecordIds}
                )`;
          conditions.push(relation.negate ? sql`not ${existsSql}` : existsSql);
        }
        const orderBy = compileSort(sort, fields);
        const whereSql = sql.join(conditions, sql` and `);
        return tx.execute<{
          name: string;
          owner_id: string;
          data: Record<string, unknown>;
          created_at: string | Date;
          updated_at: string | Date;
        }>(sql`
          select name, owner_id, data, created_at, updated_at
          from records
          where ${whereSql}
          order by ${orderBy}
          limit ${MAX_EXPORT_ROWS}
        `);
      });

      const csvRows = rows.map((row) => {
        const record: Record<string, unknown> = {
          name: row.name,
          owner_id: row.owner_id,
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
          ...row.data,
        };
        return record;
      });
      const csv = buildCsv(columns, csvRows);
      const buffer = Buffer.from(csv, 'utf8');
      const storageKey = `exports/${workspaceId}/${object.apiName}/${jobId}.csv`;
      await this.storage.putObject(storageKey, buffer, 'text/csv');

      await withWorkspace(workspaceId, async (tx) => {
        await tx
          .update(exportJobs)
          .set({ status: 'completed', downloadPath: storageKey, completedAt: new Date() })
          .where(eq(exportJobs.id, jobId));
      });

      if (ownerEmail) {
        const downloadUrl = `${this.env.API_BASE_URL}/objects/${object.apiName}/exports/${jobId}/download`;
        await this.email
          .send({
            to: ownerEmail,
            subject: `Your ${object.labelPlural} export is ready`,
            text: `Your export of ${object.labelPlural} is ready. Download it here: ${downloadUrl}`,
            html: `<p>Your export of <strong>${object.labelPlural}</strong> is ready.</p><p><a href="${downloadUrl}">Download CSV</a></p>`,
          })
          .catch((error: unknown) => {
            this.logger.error(
              `Failed to email export ${jobId}: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
          });
      }

      await this.audit.log({
        workspaceId,
        actorUserId: job.ownerId,
        action: 'export.complete',
        entityType: 'export_job',
        entityId: jobId,
        diff: { rows: csvRows.length, columns },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      await withWorkspace(workspaceId, async (tx) => {
        await tx
          .update(exportJobs)
          .set({ status: 'failed', error: message, completedAt: new Date() })
          .where(eq(exportJobs.id, jobId));
      });
      await this.audit.log({
        workspaceId,
        actorUserId: job.ownerId,
        action: 'export.fail',
        entityType: 'export_job',
        entityId: jobId,
        diff: { error: message },
      });
    }
  }
}
