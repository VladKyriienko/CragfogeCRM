import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage of the Phase 4 "Records UI" acceptance flow:
 *
 *   sign up -> create workspace -> create custom object -> add a field ->
 *   create a record -> filter the list -> inline-edit a cell -> export CSV
 *
 * Prerequisites (see apps/web/playwright.config.ts for details):
 *   1. `docker compose up -d` from the repo root (postgres, redis, minio, mailpit)
 *   2. `bun run dev` from the repo root (or `bun --filter @cragfoge/api dev`) so
 *      the API + BullMQ workers are listening on http://localhost:3000
 *
 * Run with: `bun --filter @cragfoge/web e2e` (or `cd apps/web && bun run e2e`).
 *
 * Note: the API applies a global rate limit (120 req/60s per IP, by design —
 * see `ThrottlerModule` in `apps/api/src/app.module.ts`). Running this suite
 * many times back-to-back within that window can exhaust the limit and cause
 * spurious failures (e.g. sign-up silently not completing). If reruns fail
 * right after a previous run, wait ~60s or restart the API dev server.
 */

test('records flow: object, field, record, filter, inline edit, export', async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const password = 'Passw0rd!23';
  const workspaceName = `E2E Workspace ${stamp}`;

  const objectApiName = `e2e_deal_${stamp}`;
  const objectLabelSingular = `E2E Deal ${stamp}`;
  const objectLabelPlural = `E2E Deals ${stamp}`;

  const fieldApiName = 'notes';
  const fieldLabel = 'Notes';

  const recordName = `Acme Corp ${stamp}`;

  // --- Sign up -----------------------------------------------------------
  await page.goto('/sign-up');
  await page.getByLabel('Name', { exact: true }).fill('E2E Tester');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.waitForURL('**/onboarding');

  // --- Create workspace ----------------------------------------------------
  await page.getByLabel('Workspace name', { exact: true }).fill(workspaceName);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('onboarding'));

  // --- Settings -> Objects: create a custom object ------------------------
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Create object', exact: true }).click();

  const createObjectDialog = page.getByRole('dialog');
  await createObjectDialog.getByLabel('API name', { exact: true }).fill(objectApiName);
  await createObjectDialog.getByLabel('Singular label', { exact: true }).fill(objectLabelSingular);
  await createObjectDialog.getByLabel('Plural label', { exact: true }).fill(objectLabelPlural);
  await createObjectDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(createObjectDialog).toBeHidden();

  // The new object should be auto-selected in the fields panel.
  await expect(page.getByRole('heading', { level: 3, name: 'Fields' })).toBeVisible();

  // --- Add a custom field --------------------------------------------------
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  const fieldDialog = page.getByRole('dialog');
  await fieldDialog.getByLabel('API name', { exact: true }).fill(fieldApiName);
  await fieldDialog.getByLabel('Label', { exact: true }).fill(fieldLabel);
  await fieldDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(fieldDialog).toBeHidden();
  await expect(page.getByText(fieldLabel, { exact: true }).first()).toBeVisible();

  // --- Navigate to the object's record list via the sidebar (SPA nav, no
  // reload) to prove the new object/field show up without a code reload. ---
  await page.getByRole('link', { name: objectLabelPlural, exact: true }).click();
  await page.waitForURL(`**/records/${objectApiName}`);
  await expect(page.getByRole('heading', { level: 1, name: objectLabelPlural })).toBeVisible();

  // --- Create a record ------------------------------------------------------
  // Both the header and the empty-state render a "New {label}" button while
  // the list has zero records, so disambiguate with `.first()`.
  await page
    .getByRole('button', { name: `New ${objectLabelSingular}`, exact: true })
    .first()
    .click();
  const createRecordDialog = page.getByRole('dialog');
  await createRecordDialog.getByLabel('Name', { exact: true }).fill(recordName);
  await createRecordDialog.getByLabel(fieldLabel, { exact: true }).fill('Initial notes');
  await createRecordDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(createRecordDialog).toBeHidden();

  const recordLink = page.getByRole('link', { name: recordName, exact: true });
  await expect(recordLink).toBeVisible();

  // --- Filter the list by Name = recordName ---------------------------------
  await page.getByRole('button', { name: 'Add filter', exact: true }).click();
  // Default filter row is Field=Name, Operator=is; only a value input remains.
  const filterValueInput = page.getByRole('textbox', { name: 'Filter value' });
  await filterValueInput.fill(recordName);
  await expect(recordLink).toBeVisible();

  // --- Inline-edit the custom field cell in the table ------------------------
  const row = page.locator('tr').filter({ has: recordLink });
  const notesCellInput = row.getByRole('textbox');
  await notesCellInput.fill('Updated notes');
  await notesCellInput.blur();

  // Reload to confirm the edit was persisted server-side (not just local state).
  await page.reload();
  await expect(page.getByRole('link', { name: recordName, exact: true })).toBeVisible();
  const rowAfterReload = page
    .locator('tr')
    .filter({ has: page.getByRole('link', { name: recordName, exact: true }) });
  await expect(rowAfterReload.getByRole('textbox')).toHaveValue('Updated notes');

  // --- Export CSV -------------------------------------------------------------
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const downloadButton = page.getByRole('button', { name: 'Download CSV', exact: true });
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${objectApiName}-export.csv`);
});
