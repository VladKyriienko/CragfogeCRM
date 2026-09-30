import { Inject, Injectable } from '@nestjs/common';
import { eq, memberships, users, withWorkspace, type AppDatabase } from '@cragfoge/db';
import { memberPickerItemSchema, type MemberPickerItem } from '@cragfoge/shared';
import type { RequestContext } from '../common/request-context';
import { APP_DB } from '../tokens';

@Injectable()
export class MembersService {
  constructor(@Inject(APP_DB) private readonly db: AppDatabase) {}

  async listPicker(ctx: RequestContext): Promise<MemberPickerItem[]> {
    return withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const rows = await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .where(eq(memberships.workspaceId, ctx.workspaceId));
        return rows.map((row) => memberPickerItemSchema.parse(row));
      },
      { userId: ctx.user.id },
    );
  }
}
