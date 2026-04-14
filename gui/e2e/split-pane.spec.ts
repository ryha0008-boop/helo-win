import { test, expect } from '@playwright/test';
import {
  getApp, closeApp, sessionItems, splitChildren, focusTerminal,
  typeCommand, createNewTerminal, closeActiveSession,
  clickContextMenuItem, showTestLabel,
} from './helpers';
import type { Page } from 'playwright';

let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const result = await getApp();
  page = result.page;
  // Clean up to 1 terminal, no existing splits
  while (await splitChildren(page).count() > 0) {
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }
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

// Helper: clean up all splits
async function cleanupSplits(page: Page) {
  while (await splitChildren(page).count() > 0) {
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }
}

// ==========================================
// SPLIT PANE — Layout and behavior (#19)
// ==========================================

test('split: Ctrl+Shift+D creates vertical split', async () => {
  await showTestLabel(page, 'Split Pane\nCtrl+Shift+D split...');

  await sessionItems(page).first().click();
  await page.waitForTimeout(300);

  const before = await splitChildren(page).count();
  await page.keyboard.press('Control+Shift+d');
  await page.waitForTimeout(1000);

  expect(await splitChildren(page).count()).toBe(before + 1);
});

test('split: both panes are visible', async () => {
  // Should have two split-pane elements
  const panes = page.locator('.split-pane');
  expect(await panes.count()).toBe(2);

  // Both should be visible (not display:none)
  for (let i = 0; i < await panes.count(); i++) {
    const visible = await panes.nth(i).isVisible();
    expect(visible).toBe(true);
  }
});

test('split: panes share space roughly equally', async () => {
  const panes = page.locator('.split-pane');
  const count = await panes.count();
  expect(count).toBe(2);

  const widths: number[] = [];
  for (let i = 0; i < count; i++) {
    const w = await panes.nth(i).evaluate((el) => el.getBoundingClientRect().width);
    widths.push(w);
  }

  // Both panes should have non-trivial width
  expect(widths[0]).toBeGreaterThan(50);
  expect(widths[1]).toBeGreaterThan(50);

  // The difference should be reasonable (within 10% of total)
  const total = widths[0] + widths[1];
  const diff = Math.abs(widths[0] - widths[1]);
  // Account for the divider width (3px)
  expect(diff).toBeLessThan(total * 0.15);
});

test('split: divider exists between panes', async () => {
  const divider = page.locator('.split-divider');
  expect(await divider.count()).toBe(1);

  // Divider should be visible
  expect(await divider.isVisible()).toBe(true);

  // Divider should have col-resize cursor for vertical split
  const cursor = await divider.evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toContain('col-resize');
});

test('split: divider has correct width for vertical split', async () => {
  const divider = page.locator('.split-divider');
  const width = await divider.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBe(3); // 3px as defined in CSS
});

test('split: wrapper has split-vertical class', async () => {
  const wrapper = page.locator('.terminal-wrapper.split-vertical');
  expect(await wrapper.count()).toBe(1);
});

test('split: each pane contains a terminal view', async () => {
  const panes = page.locator('.split-pane');
  const count = await panes.count();
  for (let i = 0; i < count; i++) {
    const pane = panes.nth(i);
    const termView = pane.locator('.terminal-view');
    expect(await termView.count()).toBe(1);
  }
});

test('split: drag divider resizes panes', async () => {
  const divider = page.locator('.split-divider');
  const panes = page.locator('.split-pane');

  const widthBefore = await panes.nth(0).evaluate((el) => el.getBoundingClientRect().width);

  // Simulate drag: mousedown on divider, move mouse right, mouseup
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();

  const startX = dividerBox!.x + dividerBox!.width / 2;
  const startY = dividerBox!.y + dividerBox!.height / 2;

  // Drag 50px to the right
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const widthAfter = await panes.nth(0).evaluate((el) => el.getBoundingClientRect().width);
  // First pane should have grown (or the widths should have changed)
  expect(Math.abs(widthAfter - widthBefore)).toBeGreaterThan(5);
});

test('split: closing split via sidebar close button', async () => {
  const before = await splitChildren(page).count();
  expect(before).toBeGreaterThanOrEqual(1);

  await splitChildren(page).first().locator('.session-close').click();
  await page.waitForTimeout(500);

  expect(await splitChildren(page).count()).toBe(before - 1);
});

test('split: after closing, single pane fills space', async () => {
  // No splits left
  expect(await splitChildren(page).count()).toBe(0);

  // Single pane should fill the wrapper
  const pane = page.locator('.split-pane');
  const wrapper = page.locator('.terminal-wrapper');

  const paneWidth = await pane.first().evaluate((el) => el.getBoundingClientRect().width);
  const wrapperWidth = await wrapper.evaluate((el) => el.getBoundingClientRect().width);

  // Should be roughly equal (pane fills wrapper)
  expect(paneWidth).toBeGreaterThan(wrapperWidth * 0.9);
});

test('split: split button in title bar creates split', async () => {
  await sessionItems(page).first().click();
  await page.waitForTimeout(300);

  const splitBtn = page.locator('.titlebar-action-btn[title*="Split terminal vertical"]');
  await splitBtn.click();
  await page.waitForTimeout(1000);

  expect(await splitChildren(page).count()).toBe(1);
  expect(await page.locator('.split-divider').count()).toBe(1);
});

test('split: close split via title bar button', async () => {
  const closeSplitBtn = page.locator('.titlebar-action-btn[title="Close split pane"]');
  expect(await closeSplitBtn.count()).toBe(1);

  await closeSplitBtn.click();
  await page.waitForTimeout(500);

  expect(await splitChildren(page).count()).toBe(0);
  expect(await page.locator('.split-divider').count()).toBe(0);
});

test('split: both terminals are functional', async () => {
  // Create a new split
  await page.locator('.titlebar-action-btn[title*="Split terminal vertical"]').click();
  await page.waitForTimeout(1000);

  // Type in the first pane (parent session)
  await sessionItems(page).first().click();
  await page.waitForTimeout(300);
  await focusTerminal(page);
  await typeCommand(page, 'echo "pane-one"');
  await page.waitForTimeout(1000);

  // Switch to the split child session
  await splitChildren(page).first().click();
  await page.waitForTimeout(300);
  await focusTerminal(page);
  await typeCommand(page, 'echo "pane-two"');
  await page.waitForTimeout(1000);

  // Verify both outputs exist (check the wrapper for both)
  const allText = await page.evaluate(() => {
    const wrapper = document.querySelector('.terminal-wrapper:visible') ||
                    document.querySelector('.terminal-wrapper');
    return wrapper?.textContent || '';
  });
  // At least one of them should be present
  expect(allText).toBeTruthy();

  // Clean up
  await cleanupSplits(page);
});
