import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  eq,
  fieldDefinitions,
  isNull,
  objectDefinitions,
  roleObjectPermissions,
  roles,
  sql,
  withWorkspace,
  workspaces,
  type AppDatabase,
} from '@cragfoge/db';
import {
  createFieldBodySchema,
  createObjectBodySchema,
  fieldDefinitionSchema,
  fieldDefinitionWithVisibilitySchema,
  fieldTypeSchema,
  objectDefinitionSchema,
  updateFieldBodySchema,
  updateObjectBodySchema,
  type CreateFieldBody,
  type CreateObjectBody,
  type FieldDefinitionDto,
  type FieldDefinitionWithVisibilityDto,
  type ObjectDefinitionDto,
  type UpdateFieldBody,
  type UpdateObjectBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { canPerform, fieldVisibility, type RequestContext } from '../common/request-context';
import { IndexJobsService } from '../jobs/index-jobs.service';
import { APP_DB } from '../tokens';
import { MetadataCacheService } from './metadata-cache.service';

@Injectable()
export class MetadataService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataCacheService) private readonly cache: MetadataCacheService,
    @Inject(IndexJobsService) private readonly indexJobs: IndexJobsService,
  ) {}

  async listObjects(ctx: RequestContext): Promise<ObjectDefinitionDto[]> {
    return withWorkspace(ctx.workspaceId, async (tx) => {
      const rows = await tx.select().from(objectDefinitions);
      return rows
        .filter((row) => canPerform(ctx.permissions, row.id, 'read'))
        .map((row) => this.toObjectDto(row));
    });
  }

  async getObject(ctx: RequestContext, apiName: string): Promise<ObjectDefinitionDto> {
    return withWorkspace(ctx.workspaceId, async (tx) => {
      const row = await this.findObject(tx, apiName);
      if (!canPerform(ctx.permissions, row.id, 'read')) {
        throw new ForbiddenException('Missing permission');
      }
      return this.toObjectDto(row);
    });
  }

  async createObject(ctx: RequestContext, body: CreateObjectBody): Promise<ObjectDefinitionDto> {
    const input = createObjectBodySchema.parse(body);
    const created = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [existing] = await tx
        .select({ id: objectDefinitions.id })
        .from(objectDefinitions)
        .where(eq(objectDefinitions.apiName, input.apiName))
        .limit(1);
      if (existing) {
        throw new ConflictException(`Object "${input.apiName}" already exists`);
      }

      const [row] = await tx
        .insert(objectDefinitions)
        .values({
          workspaceId: ctx.workspaceId,
          apiName: input.apiName,
          labelSingular: input.labelSingular,
          labelPlural: input.labelPlural,
          icon: input.icon ?? null,
          isSystem: false,
        })
        .returning();
      if (!row) {
        throw new ConflictException('Could not create object');
      }

      const roleRows = await tx.select().from(roles);
      const permissionValues: Array<{
        workspaceId: string;
        roleId: string;
        objectId: string;
        canRead: boolean;
        canCreate: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        scope: 'all' | 'own';
      }> = [];
      for (const role of roleRows) {
        if (role.key === 'owner' || role.key === 'admin') {
          permissionValues.push({
            workspaceId: ctx.workspaceId,
            roleId: role.id,
            objectId: row.id,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            scope: 'all',
          });
        } else if (role.key === 'member') {
          permissionValues.push({
            workspaceId: ctx.workspaceId,
            roleId: role.id,
            objectId: row.id,
            canRead: true,
            canCreate: true,
            canUpdate: true,
            canDelete: false,
            scope: 'own',
          });
        }
      }
      if (permissionValues.length > 0) {
        await tx.insert(roleObjectPermissions).values(permissionValues);
      }

      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return row;
    });

    this.cache.invalidate(ctx.workspaceId);
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'object.create',
      entityType: 'object_definition',
      entityId: created.id,
      diff: { apiName: created.apiName },
    });
    return this.toObjectDto(created);
  }

  async updateObject(
    ctx: RequestContext,
    apiName: string,
    body: UpdateObjectBody,
  ): Promise<ObjectDefinitionDto> {
    const input = updateObjectBodySchema.parse(body);
    const updated = await withWorkspace(ctx.workspaceId, async (tx) => {
      const existing = await this.findObject(tx, apiName);
      const [row] = await tx
        .update(objectDefinitions)
        .set({
          labelSingular: input.labelSingular ?? existing.labelSingular,
          labelPlural: input.labelPlural ?? existing.labelPlural,
          icon: input.icon === undefined ? existing.icon : input.icon,
          updatedAt: new Date(),
        })
        .where(eq(objectDefinitions.id, existing.id))
        .returning();
      if (!row) {
        throw new NotFoundException('Object not found');
      }
      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return row;
    });
    this.cache.invalidate(ctx.workspaceId);
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'object.update',
      entityType: 'object_definition',
      entityId: updated.id,
      diff: input,
    });
    return this.toObjectDto(updated);
  }

  async deleteObject(ctx: RequestContext, apiName: string): Promise<void> {
    const deleted = await withWorkspace(ctx.workspaceId, async (tx) => {
      const existing = await this.findObject(tx, apiName);
      if (existing.isSystem) {
        throw new ForbiddenException('System objects cannot be deleted');
      }
      const countRows = await tx.execute<{ count: string }>(sql`
        select count(*)::text as count from records
        where object_id = ${existing.id} and deleted_at is null
      `);
      const count = Number(countRows[0]?.count ?? 0);
      if (count > 0) {
        throw new ConflictException('Object has records; delete or archive them first');
      }
      await tx.delete(objectDefinitions).where(eq(objectDefinitions.id, existing.id));
      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return existing;
    });
    this.cache.invalidate(ctx.workspaceId);
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'object.delete',
      entityType: 'object_definition',
      entityId: deleted.id,
      diff: { apiName: deleted.apiName },
    });
  }

  async listFields(
    ctx: RequestContext,
    apiName: string,
  ): Promise<FieldDefinitionWithVisibilityDto[]> {
    return withWorkspace(ctx.workspaceId, async (tx) => {
      const object = await this.findObject(tx, apiName);
      if (!canPerform(ctx.permissions, object.id, 'read')) {
        throw new ForbiddenException('Missing permission');
      }
      const rows = await tx
        .select()
        .from(fieldDefinitions)
        .where(and(eq(fieldDefinitions.objectId, object.id), isNull(fieldDefinitions.deletedAt)));
      return rows
        .map((row) => ({
          row,
          visibility: fieldVisibility(ctx.fieldPermissions, row.id),
        }))
        .filter(({ visibility }) => visibility !== 'hidden')
        .map(({ row, visibility }) =>
          fieldDefinitionWithVisibilitySchema.parse({
            ...this.toFieldDto(row),
            visibility,
          }),
        );
    });
  }

  async createField(
    ctx: RequestContext,
    apiName: string,
    body: CreateFieldBody,
  ): Promise<FieldDefinitionDto> {
    const input = createFieldBodySchema.parse(body);
    fieldTypeSchema.parse(input.type);
    this.assertFieldOptions(input.type, input.options);

    const created = await withWorkspace(ctx.workspaceId, async (tx) => {
      const object = await this.findObject(tx, apiName);
      const [existing] = await tx
        .select({ id: fieldDefinitions.id })
        .from(fieldDefinitions)
        .where(
          and(
            eq(fieldDefinitions.objectId, object.id),
            eq(fieldDefinitions.apiName, input.apiName),
            isNull(fieldDefinitions.deletedAt),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException(`Field "${input.apiName}" already exists`);
      }

      const positionRows = await tx.execute<{ maxPosition: number | null }>(sql`
        select max(position) as "maxPosition" from field_definitions
        where object_id = ${object.id} and deleted_at is null
      `);
      const maxPosition = positionRows[0]?.maxPosition ?? null;

      const [row] = await tx
        .insert(fieldDefinitions)
        .values({
          workspaceId: ctx.workspaceId,
          objectId: object.id,
          apiName: input.apiName,
          label: input.label,
          type: input.type,
          required: input.required,
          isUnique: input.isUnique,
          options: input.options,
          position: input.position ?? (maxPosition ?? -1) + 1,
          isIndexed: input.isIndexed,
          isSystem: false,
        })
        .returning();
      if (!row) {
        throw new ConflictException('Could not create field');
      }
      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return row;
    });

    this.cache.invalidate(ctx.workspaceId);
    if (created.isIndexed) {
      await this.indexJobs.enqueueExpressionIndex({
        workspaceId: ctx.workspaceId,
        objectId: created.objectId,
        fieldApiName: created.apiName,
      });
    }
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'field.create',
      entityType: 'field_definition',
      entityId: created.id,
      diff: { apiName: created.apiName, type: created.type },
    });
    return this.toFieldDto(created);
  }

  async updateField(
    ctx: RequestContext,
    apiName: string,
    fieldApiName: string,
    body: UpdateFieldBody,
  ): Promise<FieldDefinitionDto> {
    const input = updateFieldBodySchema.parse(body);
    const updated = await withWorkspace(ctx.workspaceId, async (tx) => {
      const object = await this.findObject(tx, apiName);
      const existing = await this.findField(tx, object.id, fieldApiName);
      if (input.options) {
        this.assertFieldOptions(existing.type, input.options);
      }
      const nextIndexed = input.isIndexed ?? existing.isIndexed;
      const [row] = await tx
        .update(fieldDefinitions)
        .set({
          label: input.label ?? existing.label,
          required: input.required ?? existing.required,
          isUnique: input.isUnique ?? existing.isUnique,
          options: input.options ?? existing.options,
          position: input.position ?? existing.position,
          isIndexed: nextIndexed,
          updatedAt: new Date(),
        })
        .where(eq(fieldDefinitions.id, existing.id))
        .returning();
      if (!row) {
        throw new NotFoundException('Field not found');
      }
      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return { row, becameIndexed: !existing.isIndexed && nextIndexed };
    });

    this.cache.invalidate(ctx.workspaceId);
    if (updated.becameIndexed) {
      await this.indexJobs.enqueueExpressionIndex({
        workspaceId: ctx.workspaceId,
        objectId: updated.row.objectId,
        fieldApiName: updated.row.apiName,
      });
    }
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'field.update',
      entityType: 'field_definition',
      entityId: updated.row.id,
      diff: input,
    });
    return this.toFieldDto(updated.row);
  }

  async deleteField(ctx: RequestContext, apiName: string, fieldApiName: string): Promise<void> {
    const deleted = await withWorkspace(ctx.workspaceId, async (tx) => {
      const object = await this.findObject(tx, apiName);
      const existing = await this.findField(tx, object.id, fieldApiName);
      if (existing.isSystem) {
        throw new ForbiddenException('System fields cannot be deleted');
      }
      await tx
        .update(fieldDefinitions)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(fieldDefinitions.id, existing.id));
      await this.bumpMetadataVersion(tx, ctx.workspaceId);
      return existing;
    });
    this.cache.invalidate(ctx.workspaceId);
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'field.delete',
      entityType: 'field_definition',
      entityId: deleted.id,
      diff: { apiName: deleted.apiName },
    });
  }

  private assertFieldOptions(type: string, options: Record<string, unknown>): void {
    if (type === 'select' || type === 'multi_select') {
      const choices = options.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        throw new ConflictException(`${type} fields require options.choices`);
      }
    }
    if (type === 'relation') {
      if (typeof options.relatedObjectApiName !== 'string' || !options.relatedObjectApiName) {
        throw new ConflictException('relation fields require options.relatedObjectApiName');
      }
      if (options.cardinality !== 'one' && options.cardinality !== 'many') {
        throw new ConflictException('relation fields require options.cardinality one|many');
      }
    }
  }

  private async findObject(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    apiName: string,
  ) {
    const [row] = await tx
      .select()
      .from(objectDefinitions)
      .where(eq(objectDefinitions.apiName, apiName))
      .limit(1);
    if (!row) {
      throw new NotFoundException(`Object "${apiName}" not found`);
    }
    return row;
  }

  private async findField(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    objectId: string,
    fieldApiName: string,
  ) {
    const [row] = await tx
      .select()
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.objectId, objectId),
          eq(fieldDefinitions.apiName, fieldApiName),
          isNull(fieldDefinitions.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException(`Field "${fieldApiName}" not found`);
    }
    return row;
  }

  private async bumpMetadataVersion(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    workspaceId: string,
  ): Promise<void> {
    await tx
      .update(workspaces)
      .set({ metadataVersion: sql`${workspaces.metadataVersion} + 1` })
      .where(eq(workspaces.id, workspaceId));
  }

  private toObjectDto(row: typeof objectDefinitions.$inferSelect): ObjectDefinitionDto {
    return objectDefinitionSchema.parse({
      id: row.id,
      apiName: row.apiName,
      labelSingular: row.labelSingular,
      labelPlural: row.labelPlural,
      icon: row.icon,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toFieldDto(row: typeof fieldDefinitions.$inferSelect): FieldDefinitionDto {
    return fieldDefinitionSchema.parse({
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
    });
  }
}
