import { test, expect, type Page } from '@playwright/test';

// ⌘K on macOS, Ctrl+K elsewhere.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Opens the ⌘K command palette on the operator applications page. */
async function openPalette(page: Page) {
  await page.goto('/operator/applications');
  await page.waitForLoadState('networkidle');
  const input = page.getByPlaceholder('type a command…');
  // The hotkey listener attaches after hydration — retry until it lands.
  for (let i = 0; i < 6 && !(await input.isVisible()); i += 1) {
    await page.keyboard.press(`${MOD}+KeyK`);
    await page.waitForTimeout(400);
  }
  await expect(input).toBeVisible();
}

/** Types a query into the palette and hands it to the agent (⌘Enter). */
async function askAgent(page: Page, query: string) {
  await page.getByPlaceholder('type a command…').fill(query);
  await page.keyboard.press(`${MOD}+Enter`);
}

test('single-record: renders a record card and opens it', async ({ page }) => {
  await openPalette(page);
  await askAgent(page, 'show me carter blake');

  const card = page.locator('[data-spotlight="record"]').first();
  await expect(card).toBeVisible({ timeout: 75_000 });
  await expect(card).toContainText('Carter Blake', { ignoreCase: true });

  // A sole result is auto-selected — Enter opens it.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/operator\/applications\/[a-z0-9-]+/);
});

test('multi-record: renders a selectable list', async ({ page }) => {
  await openPalette(page);
  await askAgent(page, 'find pending applications');

  const list = page.locator('[data-spotlight="record-list"]').first();
  await expect(list).toBeVisible({ timeout: 75_000 });

  const rows = list.locator('[role="option"]');
  expect(await rows.count()).toBeGreaterThan(0);

  // Selection starts unselected for a multi-row result: ↓ once = first row,
  // ↓ twice = second row.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/operator\/applications\/[a-z0-9-]+/);
});

test('metric: deep-links to the intelligence tile', async ({ page }) => {
  await openPalette(page);
  await askAgent(page, 'archetype distribution');

  const metric = page.locator('[data-spotlight="metric"]').first();
  await expect(metric).toBeVisible({ timeout: 75_000 });

  await page.keyboard.press('Enter');
  await page.waitForURL('**/operator/intelligence**', { timeout: 20_000 });

  const url = new URL(page.url());
  expect(url.pathname).toBe('/operator/intelligence');
  expect(url.hash).toBe('#community.archetype-distribution');

  const tile = page.locator('[id="community.archetype-distribution"]');
  await expect(tile).toHaveClass(/flash|ring/);
});
