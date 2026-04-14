import { test, expect } from '@playwright/test';
import {
  getApp, closeApp, sessionItems, focusTerminal, typeCommand,
  createNewTerminal, closeActiveSession, showTestLabel,
  clickContextMenuItem,
} from './helpers';
import type { Page } from 'playwright';

let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const result = await getApp();
  page = result.page;
  // Ensure clean state — close extra sessions
  while (await sessionItems(page).count() > 1) {
    const closeBtn = page.locator('.session-item.active:not(.session-child) .session-close');
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      break;
    }
    await page.waitForTimeout(300);
  }
});

test.afterAll(async () => {
  await closeApp();
});

// ==========================================
// Bug #6 — Session colors not shown in collapsed sidebar
// ==========================================

test('sidebar-colors: setting a color adds borderLeft to expanded session-item', async () => {
  await showTestLabel(page, 'Sidebar Colors\nColor tag on expanded item...');

  // Ensure clean color state
  await page.evaluate(() => localStorage.removeItem('session-colors'));

  // Apply a color tag via context menu
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  // Click the Red swatch (first)
  await page.locator('.color-picker-swatch').first().click();
  await page.waitForTimeout(300);

  // Verify the session-item has borderLeft style
  const style = await sessionItems(page).first().getAttribute('style') || '';
  expect(style).toContain('border-left');
  expect(style).toContain('3px solid');
});

test('sidebar-colors: collapsed sidebar items show color indicator via borderLeft', async () => {
  await showTestLabel(page, 'Sidebar Colors\nCollapsed items show color...');

  // Verify color is set before collapsing
  const colors = await page.evaluate(() => localStorage.getItem('session-colors'));
  const parsed = JSON.parse(colors || '{}');
  const colorValues = Object.values(parsed) as string[];
  expect(colorValues.length).toBeGreaterThanOrEqual(1);

  // Collapse the sidebar
  const collapseBtn = page.locator('.titlebar-action-btn[title*="Collapse sidebar"]');
  if (await collapseBtn.count() > 0) {
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // The first collapsed item should have borderLeft with the session's color
    const collapsedItems = page.locator('.sidebar-collapsed-item');
    expect(await collapsedItems.count()).toBeGreaterThanOrEqual(1);

    const firstCollapsedStyle = await collapsedItems.first().getAttribute('style') || '';
    expect(firstCollapsedStyle).toContain('border-left');
    expect(firstCollapsedStyle).toContain('2px solid');
  }
});

test('sidebar-colors: collapsed items without a color have no borderLeft', async () => {
  // We need a session without a color — create a new one
  await createNewTerminal(page);
  await page.waitForTimeout(500);

  // The new session should NOT have a color (only the first one does)
  const collapsedItems = page.locator('.sidebar-collapsed-item');
  const count = await collapsedItems.count();

  // Check at least one collapsed item has no borderLeft style
  let foundUncolored = false;
  for (let i = 0; i < count; i++) {
    const style = await collapsedItems.nth(i).getAttribute('style');
    if (!style || !style.includes('border-left')) {
      foundUncolored = true;
      break;
    }
  }
  expect(foundUncolored).toBe(true);
});

test('sidebar-colors: different colors work for different sessions', async () => {
  // Apply a different color to the second session
  // First, expand sidebar so we can interact with session items
  const expandBtn = page.locator('.titlebar-action-btn[title*="Expand sidebar"]');
  if (await expandBtn.count() > 0) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  // Apply a different color to the second session (Blue = swatch index 5)
  await sessionItems(page).nth(1).click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').nth(5).click();
  await page.waitForTimeout(300);

  // Collapse sidebar to verify both colors show
  const collapseBtn = page.locator('.titlebar-action-btn[title*="Collapse sidebar"]');
  if (await collapseBtn.count() > 0) {
    await collapseBtn.click();
    await page.waitForTimeout(300);

    const collapsedItems = page.locator('.sidebar-collapsed-item');
    const firstStyle = await collapsedItems.first().getAttribute('style') || '';
    const secondStyle = await collapsedItems.nth(1).getAttribute('style') || '';

    // Both should have borderLeft
    expect(firstStyle).toContain('border-left');
    expect(secondStyle).toContain('border-left');

    // They should have different colors
    expect(firstStyle).not.toBe(secondStyle);
  }
});

test('sidebar-colors: color persists via localStorage after expand/collapse cycle', async () => {
  // Expand sidebar
  const expandBtn = page.locator('.titlebar-action-btn[title*="Expand sidebar"]');
  if (await expandBtn.count() > 0) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  // Verify localStorage has color entries
  const colors = await page.evaluate(() => localStorage.getItem('session-colors'));
  const parsed = JSON.parse(colors || '{}');
  const keys = Object.keys(parsed);
  expect(keys.length).toBeGreaterThanOrEqual(2);

  // Verify expanded items still show colors
  const firstStyle = await sessionItems(page).first().getAttribute('style') || '';
  expect(firstStyle).toContain('border-left');
});

test('sidebar-colors: cleanup — remove colors and close extra sessions', async () => {
  // Clear colors from all sessions
  const count = await sessionItems(page).count();
  for (let i = 0; i < count; i++) {
    const item = sessionItems(page).nth(i);
    const style = await item.getAttribute('style') || '';
    if (style.includes('border-left')) {
      await item.click({ button: 'right' });
      await page.waitForSelector('.context-menu');
      await clickContextMenuItem(page, 'Color tag');
      await page.waitForSelector('.color-picker-menu');
      await page.locator('.color-picker-clear').click();
      await page.waitForTimeout(200);
    }
  }

  // Close extra sessions
  while (await sessionItems(page).count() > 1) {
    await closeActiveSession(page);
  }
});
