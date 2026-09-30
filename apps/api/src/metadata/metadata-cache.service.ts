import { Injectable } from '@nestjs/common';
import {
  eq,
  fieldDefinitions,
  isNull,
  objectDefinitions,
  withWorkspace,
  workspaces,
} from '@cragfoge/db';
import {
  buildRecordSchema,
  fieldDefinitionSchema,
  objectDefinitionSchema,
  type FieldDefinitionDto,
  type ObjectDefinitionDto,
} from '@cragfoge/shared';
import type { z } from 'zod';

type CachedMetadata = {
  version: number;
  objectsByApiName: Map<string, ObjectDefinitionDto>;
  fieldsByObjectId: Map<string, FieldDefinitionDto[]>;
  recordSchemas: Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>;
};

@Injectable()
export class MetadataCacheService {
  private readonly cache = new Map<string, CachedMetadata>();

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  async getObject(
    workspaceId: string,
    apiName: string,
  ): Promise<{ object: ObjectDefinitionDto; fields: FieldDefinitionDto[]; version: number }> {
    const cached = await this.load(workspaceId);
    const object = cached.objectsByApiName.get(apiName);
    if (!object) {
      throw new Error(`OBJECT_NOT_FOUND:${apiName}`);
    }
    return {
      object,
      fields: cached.fieldsByObjectId.get(object.id) ?? [],
      version: cached.version,
    };
  }

  getRecordSchema(
    workspaceId: string,
    objectId: string,
    fields: FieldDefinitionDto[],
    version: number,
  ): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const cached = this.cache.get(workspaceId);
    if (cached && cached.version === version) {
      const existing = cached.recordSchemas.get(objectId);
      if (existing) {
        return existing;
      }
      const schema = buildRecordSchema(fields);
      cached.recordSchemas.set(objectId, schema);
      return schema;
    }
    return buildRecordSchema(fields);
  }

  private async load(workspaceId: string): Promise<CachedMetadata> {
    const existing = this.cache.get(workspaceId);
    const version = await withWorkspace(workspaceId, async (tx) => {
      const [row] = await tx
        .select({ metadataVersion: workspaces.metadataVersion })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      return row?.metadataVersion ?? 1;
    });

    if (existing && existing.version === version) {
      return existing;
    }

    const loaded = await withWorkspace(workspaceId, async (tx) => {
      const objectRows = await tx.select().from(objectDefinitions);
      const fieldRows = await tx
        .select()
        .from(fieldDefinitions)
        .where(isNull(fieldDefinitions.deletedAt));

      const objectsByApiName = new Map<string, ObjectDefinitionDto>();
      for (const row of objectRows) {
        objectsByApiName.set(
          row.apiName,
          objectDefinitionSchema.parse({
            id: row.id,
            apiName: row.apiName,
            labelSingular: row.labelSingular,
            labelPlural: row.labelPlural,
            icon: row.icon,
            isSystem: row.isSystem,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }),
        );
      }

      const fieldsByObjectId = new Map<string, FieldDefinitionDto[]>();
      for (const row of fieldRows) {
        const dto = fieldDefinitionSchema.parse({
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
        const list = fieldsByObjectId.get(row.objectId) ?? [];
        list.push(dto);
        fieldsByObjectId.set(row.objectId, list);
      }

      return {
        version,
        objectsByApiName,
        fieldsByObjectId,
        recordSchemas: new Map(),
      } satisfies CachedMetadata;
    });

    this.cache.set(workspaceId, loaded);
    return loaded;
  }
}
