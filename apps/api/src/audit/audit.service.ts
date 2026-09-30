import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, withWorkspace, type AppDatabase } from '@cragfoge/db';
import { APP_DB } from '../tokens';

export type AuditLogInput = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  diff?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(@Inject(APP_DB) private readonly db: AppDatabase) {}

  async log(input: AuditLogInput): Promise<void> {
    const values = {
      workspaceId: input.workspaceId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      diff: input.diff ?? null,
    };

    if (input.workspaceId) {
      await withWorkspace(
        input.workspaceId,
        async (tx) => {
          await tx.insert(auditLogs).values(values);
        },
        input.actorUserId ? { userId: input.actorUserId } : undefined,
      );
      return;
    }

    await this.db.insert(auditLogs).values(values);
  }
}
