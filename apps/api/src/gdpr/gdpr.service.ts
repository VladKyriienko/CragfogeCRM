import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  activities,
  and,
  auditLogs,
  eq,
  fieldDefinitions,
  files,
  inArray,
  isNull,
  objectDefinitions,
  openDatabase,
  or,
  recordRelations,
  records,
  sql,
  withWorkspace,
  type AppDatabase,
} from '@cragfoge/db';
import {
  gdprEraseResultSchema,
  gdprExportSchema,
  type GdprEraseResult,
  type GdprExport,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request-context';
import type { StorageProvider } from '../storage/storage.types';
import { APP_DB, STORAGE } from '../tokens';

const REDACTED = '[REDACTED]';

@Injectable()
export class GdprService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async exportPerson(ctx: RequestContext, recordId: string): Promise<GdprExport> {
    this.assertAdmin(ctx);
    return withWorkspace(ctx.workspaceId, async (tx) => {
      const person = await this.loadPersonRecord(tx, ctx.workspaceId, recordId);
      const related = await this.loadRelated(tx, ctx.workspaceId, person.id);
      const activityRows = await tx
        .select()
        .from(activities)
        .where(
          and(eq(activities.workspaceId, ctx.workspaceId), eq(activities.recordId, person.id)),
        );
      const fileRows = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.workspaceId, ctx.workspaceId),
            eq(files.recordId, person.id),
            isNull(files.deletedAt),
          ),
        );
      const auditRows = await tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.workspaceId, ctx.workspaceId), eq(auditLogs.entityId, person.id)),
        );

      return gdprExportSchema.parse({
        exportedAt: new Date().toISOString(),
        record: {
          id: person.id,
          objectApiName: person.objectApiName,
          name: person.name,
          ownerId: person.ownerId,
          data: person.data,
          createdAt: person.createdAt.toISOString(),
          updatedAt: person.updatedAt.toISOString(),
        },
        relatedRecords: related,
        activities: activityRows.map((row) => ({
          id: row.id,
          type: row.type,
          subject: row.subject,
          body: row.body,
          status: row.status,
          dueAt: row.dueAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        files: fileRows.map((row) => ({
          id: row.id,
          name: row.name,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          storageKey: row.storageKey,
          createdAt: row.createdAt.toISOString(),
        })),
        audit: auditRows.map((row) => ({
          id: row.id,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          diff: this.redactDiff(row.diff),
          createdAt: row.createdAt.toISOString(),
        })),
      });
    });
  }

  async erasePerson(ctx: RequestContext, recordId: string): Promise<GdprEraseResult> {
    this.assertAdmin(ctx);

    const result = await withWorkspace(ctx.workspaceId, async (tx) => {
      const person = await this.loadPersonRecord(tx, ctx.workspaceId, recordId);

      const activityRows = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(eq(activities.workspaceId, ctx.workspaceId), eq(activities.recordId, person.id)),
        );
      const fileRows = await tx
        .select()
        .from(files)
        .where(and(eq(files.workspaceId, ctx.workspaceId), eq(files.recordId, person.id)));
      const auditRows = await tx
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.workspaceId, ctx.workspaceId), eq(auditLogs.entityId, person.id)),
        );

      if (activityRows.length > 0) {
        await tx.delete(activities).where(
          inArray(
            activities.id,
            activityRows.map((row) => row.id),
          ),
        );
      }

      for (const file of fileRows) {
        await this.storage.deleteObject(file.storageKey).catch(() => undefined);
      }
      if (fileRows.length > 0) {
        await tx.delete(files).where(
          inArray(
            files.id,
            fileRows.map((row) => row.id),
          ),
        );
      }

      await tx
        .delete(recordRelations)
        .where(
          and(
            eq(recordRelations.workspaceId, ctx.workspaceId),
            or(
              eq(recordRelations.fromRecordId, person.id),
              eq(recordRelations.toRecordId, person.id),
            ),
          ),
        );

      await tx
        .delete(records)
        .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.id, person.id)));

      return {
        deletedRecordId: person.id,
        deletedFileIds: fileRows.map((row) => row.id),
        deletedActivityIds: activityRows.map((row) => row.id),
        redactedAuditIds: auditRows.map((row) => row.id),
      };
    });

    await this.redactAuditLogs(result.redactedAuditIds);

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'gdpr.erase',
      entityType: 'record',
      entityId: result.deletedRecordId,
      diff: {
        deletedFileIds: result.deletedFileIds,
        deletedActivityIds: result.deletedActivityIds,
        redactedAuditCount: result.redactedAuditIds.length,
      },
    });

    return gdprEraseResultSchema.parse(result);
  }

  private assertAdmin(ctx: RequestContext): void {
    if (ctx.membership.roleKey !== 'owner' && ctx.membership.roleKey !== 'admin') {
      throw new ForbiddenException('Only Owner or Admin can run GDPR export/erase');
    }
  }

  private async loadPersonRecord(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    workspaceId: string,
    recordId: string,
  ) {
    const [row] = await tx
      .select({
        id: records.id,
        name: records.name,
        ownerId: records.ownerId,
        data: records.data,
        createdAt: records.createdAt,
        updatedAt: records.updatedAt,
        objectApiName: objectDefinitions.apiName,
      })
      .from(records)
      .innerJoin(objectDefinitions, eq(records.objectId, objectDefinitions.id))
      .where(
        and(
          eq(records.workspaceId, workspaceId),
          eq(records.id, recordId),
          eq(objectDefinitions.apiName, 'people'),
          isNull(records.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException('Person record not found');
    }
    return row;
  }

  private async loadRelated(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    workspaceId: string,
    recordId: string,
  ) {
    const outgoing = await tx
      .select({
        id: records.id,
        name: records.name,
        objectApiName: objectDefinitions.apiName,
        fieldApiName: fieldDefinitions.apiName,
      })
      .from(recordRelations)
      .innerJoin(records, eq(recordRelations.toRecordId, records.id))
      .innerJoin(objectDefinitions, eq(records.objectId, objectDefinitions.id))
      .innerJoin(fieldDefinitions, eq(recordRelations.fieldId, fieldDefinitions.id))
      .where(
        and(eq(recordRelations.workspaceId, workspaceId), eq(recordRelations.fromRecordId, recordId)),
      );

    const incoming = await tx
      .select({
        id: records.id,
        name: records.name,
        objectApiName: objectDefinitions.apiName,
        fieldApiName: fieldDefinitions.apiName,
      })
      .from(recordRelations)
      .innerJoin(records, eq(recordRelations.fromRecordId, records.id))
      .innerJoin(objectDefinitions, eq(records.objectId, objectDefinitions.id))
      .innerJoin(fieldDefinitions, eq(recordRelations.fieldId, fieldDefinitions.id))
      .where(
        and(eq(recordRelations.workspaceId, workspaceId), eq(recordRelations.toRecordId, recordId)),
      );

    return [
      ...outgoing.map((row) => ({ ...row, direction: 'from' as const })),
      ...incoming.map((row) => ({ ...row, direction: 'to' as const })),
    ];
  }

  private redactDiff(diff: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!diff) return null;
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(diff)) {
      if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        redacted[key] = value;
      } else {
        redacted[key] = REDACTED;
      }
    }
    return redacted;
  }

  private async redactAuditLogs(auditIds: string[]): Promise<void> {
    if (auditIds.length === 0) {
      return;
    }
    const migratorUrl =
      process.env.DATABASE_URL_MIGRATOR ??
      'postgresql://crm_migrator:crm_migrator@localhost:5432/crm';
    const handle = openDatabase(migratorUrl);
    try {
      await handle.db.execute(sql`
        update audit_logs
        set diff = jsonb_build_object('redacted', true, 'reason', 'gdpr_erase')
        where id in (${sql.join(
          auditIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `);
    } finally {
      await handle.close();
    }
  }
}
