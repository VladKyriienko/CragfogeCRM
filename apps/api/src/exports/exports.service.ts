import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, exportJobs, withWorkspace, type AppDatabase } from '@cragfoge/db';
import {
  ADMIN_OBJECT_ID,
  createExportJobBodySchema,
  exportJobSchema,
  type CreateExportJobBody,
  type ExportJobDto,
  type FieldDefinitionDto,
} from '@cragfoge/shared';
import { canPerform, fieldVisibility, type RequestContext } from '../common/request-context';
import { DomainError } from '../common/errors/domain-error';
import { MetadataCacheService } from '../metadata/metadata-cache.service';
import type { StorageProvider } from '../storage/storage.types';
import { APP_DB, STORAGE } from '../tokens';
import { ExportWorkerService } from './export-worker.service';

const SYSTEM_COLUMNS = ['name', 'owner_id', 'created_at', 'updated_at'];

@Injectable()
export class ExportsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(MetadataCacheService) private readonly metadataCache: MetadataCacheService,
    @Inject(ExportWorkerService) private readonly worker: ExportWorkerService,
  ) {}

  async create(
    ctx: RequestContext,
    apiName: string,
    body: CreateExportJobBody,
  ): Promise<ExportJobDto> {
    const input = createExportJobBodySchema.parse(body);
    const { object, fields } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    this.assertColumnsAllowed(ctx, fields, input.columns);

    const scope = ctx.permissions.get(object.id)?.scope;
    const filter =
      scope === 'own' ? this.mergeOwnerFilter(input.filter, ctx.user.id) : (input.filter ?? null);

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(exportJobs)
          .values({
            workspaceId: ctx.workspaceId,
            objectId: object.id,
            ownerId: ctx.user.id,
            status: 'pending',
            filter,
            sort: input.sort ?? null,
            columns: input.columns,
          })
          .returning();
        if (!row) {
          throw new DomainError('export_create_failed', 'Could not create export job', 500);
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.worker.enqueue({ workspaceId: ctx.workspaceId, jobId: created.id });

    const refreshed = await this.findJob(ctx, object.id, created.id);
    return this.toDto(refreshed);
  }

  async get(ctx: RequestContext, apiName: string, jobId: string): Promise<ExportJobDto> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    const job = await this.findJob(ctx, object.id, jobId);
    this.assertJobAccess(ctx, job);
    return this.toDto(job);
  }

  async download(
    ctx: RequestContext,
    apiName: string,
    jobId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    const job = await this.findJob(ctx, object.id, jobId);
    this.assertJobAccess(ctx, job);

    if (job.status !== 'completed' || !job.downloadPath) {
      throw new DomainError('export_not_ready', 'Export is not ready for download', 409);
    }
    const buffer = await this.storage.getObject(job.downloadPath);
    return { buffer, filename: `${object.apiName}-export-${job.id}.csv` };
  }

  private mergeOwnerFilter(
    filter: CreateExportJobBody['filter'],
    userId: string,
  ): Record<string, unknown> {
    const ownerCondition = { field: 'owner_id', op: 'eq' as const, value: userId };
    if (!filter) {
      return { and: [ownerCondition] };
    }
    return { and: [ownerCondition, filter] };
  }

  private assertColumnsAllowed(
    ctx: RequestContext,
    fields: FieldDefinitionDto[],
    columns: string[],
  ): void {
    const allowed = new Set<string>(SYSTEM_COLUMNS);
    for (const field of fields) {
      if (field.type === 'relation') continue;
      if (fieldVisibility(ctx.fieldPermissions, field.id) === 'hidden') continue;
      allowed.add(field.apiName);
    }
    const unknown = columns.filter((column) => !allowed.has(column));
    if (unknown.length > 0) {
      throw new DomainError(
        'invalid_export_columns',
        `Unknown or unexportable column(s): ${unknown.join(', ')}`,
        400,
      );
    }
  }

  private assertObjectPermission(ctx: RequestContext, objectId: string, action: 'read'): void {
    if (!canPerform(ctx.permissions, objectId, action)) {
      throw new ForbiddenException('Missing permission');
    }
  }

  private assertJobAccess(ctx: RequestContext, job: typeof exportJobs.$inferSelect): void {
    if (job.ownerId === ctx.user.id) return;
    if (canPerform(ctx.permissions, ADMIN_OBJECT_ID, 'read')) return;
    throw new ForbiddenException('Cannot access this export');
  }

  private async resolveObject(ctx: RequestContext, apiName: string) {
    try {
      return await this.metadataCache.getObject(ctx.workspaceId, apiName);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OBJECT_NOT_FOUND:')) {
        throw new NotFoundException(`Object "${apiName}" not found`);
      }
      throw error;
    }
  }

  private async findJob(ctx: RequestContext, objectId: string, jobId: string) {
    const [row] = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select()
        .from(exportJobs)
        .where(and(eq(exportJobs.id, jobId), eq(exportJobs.objectId, objectId)))
        .limit(1),
    );
    if (!row) {
      throw new NotFoundException('Export job not found');
    }
    return row;
  }

  private toDto(row: typeof exportJobs.$inferSelect): ExportJobDto {
    return exportJobSchema.parse({
      id: row.id,
      objectId: row.objectId,
      ownerId: row.ownerId,
      status: row.status,
      filter: row.filter,
      sort: row.sort,
      columns: row.columns,
      fileId: row.fileId,
      downloadPath: row.downloadPath,
      error: row.error,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    });
  }
}
