import { Inject, Injectable } from '@nestjs/common';
import { count, users, type AppDatabase } from '@cragfoge/db';
import { setupStatusSchema, type SetupStatus } from '@cragfoge/shared';
import { APP_DB } from '../tokens';

@Injectable()
export class SetupService {
  constructor(@Inject(APP_DB) private readonly db: AppDatabase) {}

  async status(): Promise<SetupStatus> {
    const [row] = await this.db.select({ value: count() }).from(users);
    return setupStatusSchema.parse({ needsSetup: Number(row?.value ?? 0) === 0 });
  }
}
