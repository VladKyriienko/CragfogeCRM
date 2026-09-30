import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  eq,
  isNull,
  recordRelations,
  records,
  sql,
  withWorkspace,
  type AppDatabase,
} from '@cragfoge/db';
import {
  bulkDeleteBodySchema,
  bulkOperationResultSchema,
  bulkUpdateBodySchema,
  createRecordBodySchema,
  listRecordsQuerySchema,
  recordSchema,
  updateRecordBodySchema,
  type BulkDeleteBody,
  type BulkOperationError,
  type BulkOperationResult,
  type BulkUpdateBody,
  type CreateRecordBody,
  type FieldDefinitionDto,
  type ListRecordsQuery,
  type ListRecordsResponse,
  type RecordDto,
  type UpdateRecordBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { DomainError, FieldValidationError } from '../common/errors/domain-error';
import { canPerform, fieldVisibility, type RequestContext } from '../common/request-context';
import { DomainEventsService } from '../events/domain-events.service';
import { MetadataCacheService } from '../metadata/metadata-cache.service';
import { APP_DB } from '../tokens';
import { compileFilter, compileSort } from './filter-sql';

type CursorPayload = { createdAt: string; id: string };

@Injectable()
export class RecordsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataCacheService) private readonly metadataCache: MetadataCacheService,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
  ) {}

  async list(
    ctx: RequestContext,
    apiName: string,
    rawQuery: Record<string, unknown>,
  ): Promise<ListRecordsResponse> {
    const query = this.parseListQuery(rawQuery);
    const { object, fields, version } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');

    const visibleFields = this.visibleFields(ctx, fields);
    const compiled = compileFilter(query.filter, fields);
    const orderBy = compileSort(query.sort, fields);
    const ownScope = ctx.permissions.get(object.id)?.scope === 'own';

    const items = await withWorkspace(ctx.workspaceId, async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [
        sql`object_id = ${object.id}`,
        sql`deleted_at is null`,
      ];
      if (ownScope) {
        conditions.push(sql`owner_id = ${ctx.user.id}`);
      }
      if (compiled.sql) {
        conditions.push(compiled.sql);
      }
      if (query.q) {
        conditions.push(sql`search @@ plainto_tsquery('simple', ${query.q})`);
      }
      for (const relation of compiled.relationExists) {
        if (relation.toRecordIds.length === 0) {
          const existsSql = sql`exists (
            select 1 from record_relations rr
            where rr.from_record_id = records.id
              and rr.field_id = ${relation.fieldId}
          )`;
          conditions.push(relation.negate ? sql`not ${existsSql}` : existsSql);
        } else {
          const existsSql = sql`exists (
            select 1 from record_relations rr
            where rr.from_record_id = records.id
              and rr.field_id = ${relation.fieldId}
              and rr.to_record_id in ${relation.toRecordIds}
          )`;
          conditions.push(relation.negate ? sql`not ${existsSql}` : existsSql);
        }
      }

      if (query.cursor) {
        const cursor = this.decodeCursor(query.cursor);
        conditions.push(
          sql`(created_at, id) < (${new Date(cursor.createdAt)}, ${cursor.id}::uuid)`,
        );
      }

      const whereSql = sql.join(conditions, sql` and `);
      const rows = await tx.execute<{
        id: string;
        object_id: string;
        name: string;
        owner_id: string;
        data: Record<string, unknown>;
        created_by: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(sql`
        select id, object_id, name, owner_id, data, created_by, created_at, updated_at
        from records
        where ${whereSql}
        order by ${orderBy}
        limit ${query.limit + 1}
      `);
      return rows.map((row) => ({
        id: row.id,
        objectId: row.object_id,
        name: row.name,
        ownerId: row.owner_id,
        data: row.data ?? {},
        createdBy: row.created_by,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    });

    const page = items.slice(0, query.limit);
    const relationMap = await this.loadRelations(
      ctx.workspaceId,
      page.map((row) => row.id),
      fields,
    );

    void version;
    const mapped = page.map((row) =>
      this.toDto(row, relationMap.get(row.id) ?? {}, visibleFields, ctx),
    );
    const nextCursor =
      items.length > query.limit
        ? this.encodeCursor({
            createdAt: page[page.length - 1]!.createdAt.toISOString(),
            id: page[page.length - 1]!.id,
          })
        : null;

    return { items: mapped, nextCursor };
  }

  async get(ctx: RequestContext, apiName: string, id: string): Promise<RecordDto> {
    const { object, fields } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    const row = await this.findRecord(ctx, object.id, id);
    this.assertOwnScope(ctx, object.id, row.ownerId);
    const relationMap = await this.loadRelations(ctx.workspaceId, [row.id], fields);
    return this.toDto(row, relationMap.get(row.id) ?? {}, this.visibleFields(ctx, fields), ctx);
  }

  async create(ctx: RequestContext, apiName: string, body: CreateRecordBody): Promise<RecordDto> {
    const input = createRecordBodySchema.parse(body);
    const { object, fields, version } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'create');

    const writable = this.writableFields(ctx, fields);
    const dataFields = writable.filter((field) => field.type !== 'relation');
    const schema = this.metadataCache.getRecordSchema(
      ctx.workspaceId,
      object.id,
      dataFields,
      version,
    );
    const sanitizedData = this.pickWritableData(input.data, writable);
    const parsedData = schema.safeParse(sanitizedData);
    if (!parsedData.success) {
      throw new FieldValidationError(
        parsedData.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'data',
          message: issue.message,
        })),
      );
    }

    const ownerId = input.ownerId ?? ctx.user.id;
    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(records)
          .values({
            workspaceId: ctx.workspaceId,
            objectId: object.id,
            name: input.name,
            ownerId,
            data: parsedData.data,
            createdBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new DomainError('create_failed', 'Could not create record', 500);
        }
        await this.replaceRelations(tx, ctx.workspaceId, row.id, fields, writable, input.relations);
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'record.create',
      entityType: 'record',
      entityId: created.id,
      diff: { name: created.name, data: created.data, relations: input.relations ?? {} },
    });

    await this.domainEvents.emit({
      type: 'record.created',
      workspaceId: ctx.workspaceId,
      objectId: object.id,
      objectApiName: apiName,
      recordId: created.id,
      actorUserId: ctx.user.id,
      record: {
        id: created.id,
        name: created.name,
        ownerId: created.ownerId,
        data: created.data,
      },
      source: 'user',
    });

    const relationMap = await this.loadRelations(ctx.workspaceId, [created.id], fields);
    return this.toDto(
      created,
      relationMap.get(created.id) ?? {},
      this.visibleFields(ctx, fields),
      ctx,
    );
  }

  async update(
    ctx: RequestContext,
    apiName: string,
    id: string,
    body: UpdateRecordBody,
  ): Promise<RecordDto> {
    const input = updateRecordBodySchema.parse(body);
    const { object, fields, version } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'update');
    const existing = await this.findRecord(ctx, object.id, id);
    this.assertOwnScope(ctx, object.id, existing.ownerId);

    const writable = this.writableFields(ctx, fields);
    const dataFields = writable.filter((field) => field.type !== 'relation');
    const schema = this.metadataCache.getRecordSchema(
      ctx.workspaceId,
      object.id,
      dataFields,
      version,
    );

    const nextData =
      input.data !== undefined
        ? { ...existing.data, ...this.pickWritableData(input.data, writable) }
        : existing.data;
    const parsedData = schema.safeParse(nextData);
    if (!parsedData.success) {
      throw new FieldValidationError(
        parsedData.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'data',
          message: issue.message,
        })),
      );
    }

    const rejected = this.rejectedWriteFields(input.data ?? {}, fields, ctx);
    if (rejected.length > 0) {
      throw new FieldValidationError(
        rejected.map((path) => ({ path, message: 'Field is not writable' })),
      );
    }

    const updated = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .update(records)
          .set({
            name: input.name ?? existing.name,
            ownerId: input.ownerId ?? existing.ownerId,
            data: parsedData.data,
            updatedAt: new Date(),
          })
          .where(and(eq(records.id, id), isNull(records.deletedAt)))
          .returning();
        if (!row) {
          throw new NotFoundException('Record not found');
        }
        if (input.relations) {
          await this.replaceRelations(
            tx,
            ctx.workspaceId,
            row.id,
            fields,
            writable,
            input.relations,
          );
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    const diff = this.buildDiff(existing, updated, input.relations);
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'record.update',
      entityType: 'record',
      entityId: updated.id,
      diff,
    });

    const recordSnapshot = {
      id: updated.id,
      name: updated.name,
      ownerId: updated.ownerId,
      data: updated.data,
    };
    await this.domainEvents.emit({
      type: 'record.updated',
      workspaceId: ctx.workspaceId,
      objectId: object.id,
      objectApiName: apiName,
      recordId: updated.id,
      actorUserId: ctx.user.id,
      record: recordSnapshot,
      previousData: existing.data,
      source: 'user',
    });
    if (existing.data.stage !== updated.data.stage) {
      await this.domainEvents.emit({
        type: 'record.stage_changed',
        workspaceId: ctx.workspaceId,
        objectId: object.id,
        objectApiName: apiName,
        recordId: updated.id,
        actorUserId: ctx.user.id,
        record: recordSnapshot,
        previousData: existing.data,
        source: 'user',
      });
    }

    const relationMap = await this.loadRelations(ctx.workspaceId, [updated.id], fields);
    return this.toDto(
      updated,
      relationMap.get(updated.id) ?? {},
      this.visibleFields(ctx, fields),
      ctx,
    );
  }

  async remove(ctx: RequestContext, apiName: string, id: string): Promise<void> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'delete');
    const existing = await this.findRecord(ctx, object.id, id);
    this.assertOwnScope(ctx, object.id, existing.ownerId);

    await withWorkspace(ctx.workspaceId, async (tx) => {
      await tx
        .update(records)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(records.id, id));
    });

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'record.delete',
      entityType: 'record',
      entityId: id,
      diff: { name: existing.name },
    });

    await this.domainEvents.emit({
      type: 'record.deleted',
      workspaceId: ctx.workspaceId,
      objectId: object.id,
      objectApiName: apiName,
      recordId: id,
      actorUserId: ctx.user.id,
      previousData: existing.data,
      source: 'user',
    });
  }

  async bulkDelete(
    ctx: RequestContext,
    apiName: string,
    body: BulkDeleteBody,
  ): Promise<BulkOperationResult> {
    const input = bulkDeleteBodySchema.parse(body);
    const succeededIds: string[] = [];
    const errors: BulkOperationError[] = [];
    for (const id of input.ids) {
      try {
        await this.remove(ctx, apiName, id);
        succeededIds.push(id);
      } catch (error) {
        errors.push({ id, message: this.errorMessage(error) });
      }
    }
    return bulkOperationResultSchema.parse({ succeededIds, errors });
  }

  async bulkUpdate(
    ctx: RequestContext,
    apiName: string,
    body: BulkUpdateBody,
  ): Promise<BulkOperationResult> {
    const input = bulkUpdateBodySchema.parse(body);
    const succeededIds: string[] = [];
    const errors: BulkOperationError[] = [];
    for (const id of input.ids) {
      try {
        await this.update(ctx, apiName, id, { data: input.data });
        succeededIds.push(id);
      } catch (error) {
        errors.push({ id, message: this.errorMessage(error) });
      }
    }
    return bulkOperationResultSchema.parse({ succeededIds, errors });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof DomainError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }

  private parseListQuery(raw: Record<string, unknown>): ListRecordsQuery {
    const parseJson = (value: unknown): unknown => {
      if (typeof value !== 'string') {
        return value;
      }
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new DomainError('invalid_query', 'Invalid JSON in query parameter', 400);
      }
    };
    return listRecordsQuerySchema.parse({
      ...raw,
      filter: parseJson(raw.filter),
      sort: parseJson(raw.sort),
    });
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

  private assertObjectPermission(
    ctx: RequestContext,
    objectId: string,
    action: 'read' | 'create' | 'update' | 'delete',
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

  private visibleFields(ctx: RequestContext, fields: FieldDefinitionDto[]): FieldDefinitionDto[] {
    return fields.filter((field) => fieldVisibility(ctx.fieldPermissions, field.id) !== 'hidden');
  }

  private writableFields(ctx: RequestContext, fields: FieldDefinitionDto[]): FieldDefinitionDto[] {
    return fields.filter((field) => fieldVisibility(ctx.fieldPermissions, field.id) === 'write');
  }

  private pickWritableData(
    data: Record<string, unknown>,
    writable: FieldDefinitionDto[],
  ): Record<string, unknown> {
    const allowed = new Set(writable.filter((f) => f.type !== 'relation').map((f) => f.apiName));
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }

  private rejectedWriteFields(
    data: Record<string, unknown>,
    fields: FieldDefinitionDto[],
    ctx: RequestContext,
  ): string[] {
    const byApiName = new Map(fields.map((field) => [field.apiName, field]));
    const rejected: string[] = [];
    for (const key of Object.keys(data)) {
      const field = byApiName.get(key);
      if (!field) {
        rejected.push(key);
        continue;
      }
      if (fieldVisibility(ctx.fieldPermissions, field.id) !== 'write') {
        rejected.push(key);
      }
    }
    return rejected;
  }

  private async findRecord(ctx: RequestContext, objectId: string, id: string) {
    const [row] = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select()
        .from(records)
        .where(and(eq(records.id, id), eq(records.objectId, objectId), isNull(records.deletedAt)))
        .limit(1),
    );
    if (!row) {
      throw new NotFoundException('Record not found');
    }
    return row;
  }

  private async loadRelations(
    workspaceId: string,
    recordIds: string[],
    fields: FieldDefinitionDto[],
  ): Promise<Map<string, Record<string, string[]>>> {
    const relationFields = fields.filter((field) => field.type === 'relation');
    const result = new Map<string, Record<string, string[]>>();
    if (recordIds.length === 0 || relationFields.length === 0) {
      return result;
    }
    const fieldIds = relationFields.map((field) => field.id);
    const rows = await withWorkspace(workspaceId, (tx) =>
      tx
        .select()
        .from(recordRelations)
        .where(
          and(
            sql`${recordRelations.fromRecordId} in ${recordIds}`,
            sql`${recordRelations.fieldId} in ${fieldIds}`,
          ),
        ),
    );
    const fieldApiName = new Map(relationFields.map((field) => [field.id, field.apiName]));
    for (const row of rows) {
      const apiName = fieldApiName.get(row.fieldId);
      if (!apiName) continue;
      const current = result.get(row.fromRecordId) ?? {};
      const list = current[apiName] ?? [];
      list.push(row.toRecordId);
      current[apiName] = list;
      result.set(row.fromRecordId, current);
    }
    return result;
  }

  private async replaceRelations(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    workspaceId: string,
    fromRecordId: string,
    fields: FieldDefinitionDto[],
    writable: FieldDefinitionDto[],
    relations: Record<string, string | string[]> | undefined,
  ): Promise<void> {
    if (!relations) return;
    const writableApiNames = new Set(writable.map((field) => field.apiName));
    const byApiName = new Map(fields.map((field) => [field.apiName, field]));

    for (const [apiName, value] of Object.entries(relations)) {
      const field = byApiName.get(apiName);
      if (!field || field.type !== 'relation') {
        throw new FieldValidationError([{ path: apiName, message: 'Unknown relation field' }]);
      }
      if (!writableApiNames.has(apiName)) {
        throw new FieldValidationError([{ path: apiName, message: 'Field is not writable' }]);
      }
      const cardinality = field.options.cardinality === 'many' ? 'many' : 'one';
      const ids = Array.isArray(value) ? value : [value];
      if (cardinality === 'one' && ids.length > 1) {
        throw new FieldValidationError([{ path: apiName, message: 'Relation cardinality is one' }]);
      }
      await tx
        .delete(recordRelations)
        .where(
          and(
            eq(recordRelations.fromRecordId, fromRecordId),
            eq(recordRelations.fieldId, field.id),
          ),
        );
      if (ids.length > 0) {
        await tx.insert(recordRelations).values(
          ids.map((toRecordId) => ({
            workspaceId,
            fieldId: field.id,
            fromRecordId,
            toRecordId,
          })),
        );
      }
    }
  }

  private buildDiff(
    before: typeof records.$inferSelect,
    after: typeof records.$inferSelect,
    relations?: Record<string, string | string[]>,
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    if (before.name !== after.name) {
      diff.name = { from: before.name, to: after.name };
    }
    if (before.ownerId !== after.ownerId) {
      diff.ownerId = { from: before.ownerId, to: after.ownerId };
    }
    const dataDiff: Record<string, { from: unknown; to: unknown }> = {};
    const keys = new Set([...Object.keys(before.data), ...Object.keys(after.data)]);
    for (const key of keys) {
      const from = before.data[key];
      const to = after.data[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        dataDiff[key] = { from, to };
      }
    }
    if (Object.keys(dataDiff).length > 0) {
      diff.data = dataDiff;
    }
    if (relations) {
      diff.relations = relations;
    }
    return diff;
  }

  private toDto(
    row: {
      id: string;
      objectId: string;
      name: string;
      ownerId: string;
      data: Record<string, unknown>;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    },
    relations: Record<string, string[]>,
    visibleFields: FieldDefinitionDto[],
    ctx: RequestContext,
  ): RecordDto {
    const visibleApiNames = new Set(visibleFields.map((field) => field.apiName));
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row.data)) {
      if (visibleApiNames.has(key)) {
        data[key] = value;
      }
    }
    const visibleRelations: Record<string, string[]> = {};
    for (const field of visibleFields) {
      if (field.type === 'relation' && relations[field.apiName]) {
        visibleRelations[field.apiName] = relations[field.apiName]!;
      }
    }
    void ctx;
    return recordSchema.parse({
      id: row.id,
      objectId: row.objectId,
      name: row.name,
      ownerId: row.ownerId,
      data,
      relations: visibleRelations,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string): CursorPayload {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
      if (!parsed.createdAt || !parsed.id) {
        throw new Error('invalid');
      }
      return parsed;
    } catch {
      throw new DomainError('invalid_cursor', 'Invalid pagination cursor', 400);
    }
  }
}
