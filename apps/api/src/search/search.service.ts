import { Inject, Injectable } from '@nestjs/common';
import { objectDefinitions, sql, withWorkspace, type AppDatabase } from '@cragfoge/db';
import {
  globalSearchQuerySchema,
  globalSearchResponseSchema,
  globalSearchResultSchema,
  type GlobalSearchResponse,
} from '@cragfoge/shared';
import { canPerform, type RequestContext } from '../common/request-context';
import { APP_DB } from '../tokens';

@Injectable()
export class SearchService {
  constructor(@Inject(APP_DB) private readonly db: AppDatabase) {}

  async search(
    ctx: RequestContext,
    rawQuery: Record<string, unknown>,
  ): Promise<GlobalSearchResponse> {
    const query = globalSearchQuerySchema.parse(rawQuery);

    const readableObjects = await withWorkspace(ctx.workspaceId, async (tx) => {
      const rows = await tx.select().from(objectDefinitions);
      return rows.filter((row) => canPerform(ctx.permissions, row.id, 'read'));
    });

    if (readableObjects.length === 0) {
      return globalSearchResponseSchema.parse({ items: [] });
    }

    const objectConditions = readableObjects.map((object) => {
      const scope = ctx.permissions.get(object.id)?.scope;
      if (scope === 'own') {
        return sql`(object_id = ${object.id} and owner_id = ${ctx.user.id})`;
      }
      return sql`object_id = ${object.id}`;
    });
    const objectFilter = sql`(${sql.join(objectConditions, sql` or `)})`;
    const tsQuery = sql`plainto_tsquery('simple', ${query.q})`;

    const rows = await withWorkspace(ctx.workspaceId, (tx) =>
      tx.execute<{ id: string; object_id: string; name: string }>(sql`
        select id, object_id, name
        from records
        where deleted_at is null
          and ${objectFilter}
          and search @@ ${tsQuery}
        order by ts_rank(search, ${tsQuery}) desc
        limit ${query.limit}
      `),
    );

    const objectsById = new Map(readableObjects.map((object) => [object.id, object]));
    const items = rows.flatMap((row) => {
      const object = objectsById.get(row.object_id);
      if (!object) {
        return [];
      }
      return [
        globalSearchResultSchema.parse({
          objectApiName: object.apiName,
          objectLabel: object.labelSingular,
          recordId: row.id,
          name: row.name,
        }),
      ];
    });

    return globalSearchResponseSchema.parse({ items });
  }
}
