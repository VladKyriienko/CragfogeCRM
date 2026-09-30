/**
 * Seeds 1,000,000 records and measures list/filter/sort p95.
 *
 * Usage (Docker Postgres up):
 *   bun packages/db/scripts/perf-records.ts
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { prepareDatabase } from '../src/migrate';
import { DEFAULT_ADMIN_DATABASE_URL, DEFAULT_MIGRATOR_DATABASE_URL } from '../src/defaults';

const TARGET = 1_000_000;
const BATCH = 5_000;
const SAMPLE = 50;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

async function main(): Promise<void> {
  await prepareDatabase();
  const migrator = postgres(process.env.DATABASE_URL_MIGRATOR ?? DEFAULT_MIGRATOR_DATABASE_URL, {
    max: 4,
  });
  const app = postgres(
    process.env.DATABASE_URL ?? 'postgresql://crm_app:crm_app@localhost:5432/crm',
    {
      max: 4,
    },
  );

  const workspaceId = randomUUID();
  const userId = randomUUID();
  const objectId = randomUUID();
  const roleId = randomUUID();

  console.log('Preparing workspace…');
  await migrator`
    insert into users (id, name, email, email_verified)
    values (${userId}, 'Perf User', ${`perf-${userId}@example.com`}, true)
  `;
  await migrator`
    insert into workspaces (id, name, slug)
    values (${workspaceId}, 'Perf Workspace', ${`perf-${workspaceId}`})
  `;
  await migrator`
    insert into roles (id, workspace_id, name, key, is_system)
    values (${roleId}, ${workspaceId}, 'Owner', 'owner', true)
  `;
  await migrator`
    insert into memberships (workspace_id, user_id, role_id)
    values (${workspaceId}, ${userId}, ${roleId})
  `;
  await migrator`
    insert into object_definitions (id, workspace_id, api_name, label_singular, label_plural, is_system)
    values (${objectId}, ${workspaceId}, 'perf_items', 'Perf item', 'Perf items', false)
  `;
  await migrator`
    insert into field_definitions (workspace_id, object_id, api_name, label, type, options, position, is_indexed)
    values
      (${workspaceId}, ${objectId}, 'stage', 'Stage', 'select', ${migrator.json({
        choices: [
          { value: 'open', label: 'Open' },
          { value: 'won', label: 'Won' },
        ],
      })}, 0, true),
      (${workspaceId}, ${objectId}, 'amount', 'Amount', 'number', ${migrator.json({})}, 1, true)
  `;

  console.log(`Seeding ${TARGET.toLocaleString()} records…`);
  const startedSeed = Date.now();
  for (let offset = 0; offset < TARGET; offset += BATCH) {
    const values = [];
    for (let i = 0; i < BATCH && offset + i < TARGET; i += 1) {
      const n = offset + i;
      const stage = n % 10 === 0 ? 'won' : 'open';
      const amount = (n % 10_000) + 1;
      values.push({
        workspace_id: workspaceId,
        object_id: objectId,
        name: `Item ${n}`,
        owner_id: userId,
        created_by: userId,
        data: { stage, amount },
      });
    }
    await migrator`
      insert into records ${migrator(
        values,
        'workspace_id',
        'object_id',
        'name',
        'owner_id',
        'created_by',
        'data',
      )}
    `;
    if ((offset / BATCH) % 20 === 0) {
      console.log(`  …${(offset + BATCH).toLocaleString()}`);
    }
  }
  console.log(`Seed done in ${((Date.now() - startedSeed) / 1000).toFixed(1)}s`);

  console.log('Creating expression indexes…');
  await migrator.unsafe(`
    CREATE INDEX IF NOT EXISTS records_perf_stage_idx
      ON records ((data->>'stage'))
      WHERE workspace_id = '${workspaceId}' AND object_id = '${objectId}' AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS records_perf_amount_idx
      ON records (((data->>'amount')::numeric))
      WHERE workspace_id = '${workspaceId}' AND object_id = '${objectId}' AND deleted_at IS NULL;
    ANALYZE records;
  `);

  async function timed(label: string, fn: () => Promise<void>): Promise<number[]> {
    const samples: number[] = [];
    for (let i = 0; i < SAMPLE; i += 1) {
      const t0 = performance.now();
      await fn();
      samples.push(performance.now() - t0);
    }
    console.log(
      `${label}: p50=${percentile(samples, 50).toFixed(1)}ms p95=${percentile(samples, 95).toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms`,
    );
    return samples;
  }

  await app`select set_config('app.workspace_id', ${workspaceId}, false)`;

  const listSamples = await timed('list (limit 25)', async () => {
    await app`
      select id, name, data from records
      where workspace_id = ${workspaceId}::uuid
        and object_id = ${objectId}::uuid
        and deleted_at is null
      order by created_at desc, id desc
      limit 25
    `;
  });

  const filterSamples = await timed('filter stage=won AND amount>=5000', async () => {
    await app`
      select id, name, data from records
      where workspace_id = ${workspaceId}::uuid
        and object_id = ${objectId}::uuid
        and deleted_at is null
        and (data->>'stage') = 'won'
        and ((data->>'amount')::numeric) >= 5000
      order by created_at desc, id desc
      limit 25
    `;
  });

  const sortSamples = await timed('sort by amount desc', async () => {
    await app`
      select id, name, data from records
      where workspace_id = ${workspaceId}::uuid
        and object_id = ${objectId}::uuid
        and deleted_at is null
      order by ((data->>'amount')::numeric) desc nulls last, id desc
      limit 25
    `;
  });

  const report = {
    records: TARGET,
    list_p95_ms: Number(percentile(listSamples, 95).toFixed(1)),
    filter_p95_ms: Number(percentile(filterSamples, 95).toFixed(1)),
    sort_p95_ms: Number(percentile(sortSamples, 95).toFixed(1)),
    budget_ms: 300,
  };
  console.log('\nREPORT', JSON.stringify(report, null, 2));

  await migrator`
    delete from workspaces where id = ${workspaceId}
  `;
  await migrator`delete from users where id = ${userId}`;
  await migrator.end();
  await app.end();
  void DEFAULT_ADMIN_DATABASE_URL;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
