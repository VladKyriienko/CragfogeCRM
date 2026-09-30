import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, files, isNull, records, withWorkspace, type AppDatabase } from '@cragfoge/db';
import {
  fileSchema,
  uploadFileBodySchema,
  MAX_FILE_SIZE_BYTES,
  type FileDto,
  type UploadFileBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { canPerform, type RequestContext } from '../common/request-context';
import { MetadataCacheService } from '../metadata/metadata-cache.service';
import type { StorageProvider } from '../storage/storage.types';
import { APP_DB, STORAGE } from '../tokens';

@Injectable()
export class FilesService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataCacheService) private readonly metadataCache: MetadataCacheService,
  ) {}

  async list(ctx: RequestContext, apiName: string, recordId: string): Promise<FileDto[]> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    const record = await this.findRecord(ctx, object.id, recordId);
    this.assertOwnScope(ctx, object.id, record.ownerId);

    const rows = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select()
        .from(files)
        .where(and(eq(files.recordId, recordId), isNull(files.deletedAt))),
    );
    return rows.map((row) => this.toDto(row));
  }

  async upload(
    ctx: RequestContext,
    apiName: string,
    recordId: string,
    body: UploadFileBody,
  ): Promise<FileDto> {
    const input = uploadFileBodySchema.parse(body);
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'update');
    const record = await this.findRecord(ctx, object.id, recordId);
    this.assertOwnScope(ctx, object.id, record.ownerId);

    const buffer = this.decodeBase64(input.data);
    if (buffer.length === 0) {
      throw new BadRequestException('File is empty');
    }
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`);
    }

    const storageKey = `files/${ctx.workspaceId}/${object.id}/${recordId}/${randomUUID()}-${input.name}`;
    await this.storage.putObject(storageKey, buffer, input.mimeType);

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(files)
          .values({
            workspaceId: ctx.workspaceId,
            recordId,
            objectId: object.id,
            name: input.name,
            mimeType: input.mimeType,
            sizeBytes: buffer.length,
            storageKey,
            uploadedBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new BadRequestException('Could not create file record');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'file.upload',
      entityType: 'file',
      entityId: created.id,
      diff: { name: created.name, recordId, sizeBytes: created.sizeBytes },
    });

    return this.toDto(created);
  }

  async remove(
    ctx: RequestContext,
    apiName: string,
    recordId: string,
    fileId: string,
  ): Promise<void> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'update');
    const record = await this.findRecord(ctx, object.id, recordId);
    this.assertOwnScope(ctx, object.id, record.ownerId);

    const deleted = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(files)
          .where(and(eq(files.id, fileId), eq(files.recordId, recordId), isNull(files.deletedAt)))
          .limit(1);
        if (!row) {
          throw new NotFoundException('File not found');
        }
        await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, row.id));
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.storage.deleteObject(deleted.storageKey).catch(() => undefined);

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'file.delete',
      entityType: 'file',
      entityId: deleted.id,
      diff: { name: deleted.name, recordId },
    });
  }

  private decodeBase64(data: string): Buffer {
    try {
      return Buffer.from(data, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 file data');
    }
  }

  private assertObjectPermission(
    ctx: RequestContext,
    objectId: string,
    action: 'read' | 'update',
  ): void {
    if (!canPerform(ctx.permissions, objectId, action)) {
      throw new ForbiddenException('Missing permission');
    }
  }

  private assertOwnScope(ctx: RequestContext, objectId: string, ownerId: string): void {
    if (ctx.permissions.get(objectId)?.scope === 'own' && ownerId !== ctx.user.id) {
      throw new ForbiddenException('Record outside ownership scope');
    }
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

  private async findRecord(ctx: RequestContext, objectId: string, recordId: string) {
    const [row] = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select({ id: records.id, ownerId: records.ownerId })
        .from(records)
        .where(
          and(eq(records.id, recordId), eq(records.objectId, objectId), isNull(records.deletedAt)),
        )
        .limit(1),
    );
    if (!row) {
      throw new NotFoundException('Record not found');
    }
    return row;
  }

  private toDto(row: typeof files.$inferSelect): FileDto {
    return fileSchema.parse({
      id: row.id,
      recordId: row.recordId,
      objectId: row.objectId,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
    });
  }
}
