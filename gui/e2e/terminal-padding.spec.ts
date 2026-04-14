import { test, expect } from '@playwright/test';
import {
  getApp, closeApp, sessionItems, focusTerminal, typeCommand,
  createNewTerminal, closeActiveSession, showTestLabel,
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
// Bug #8 — Bottom line of terminal output clipped by status bar
// ==========================================

test('terminal-padding: terminal-view has adequate bottom padding', async () => {
  await showTestLabel(page, 'Terminal Padding\nChecking padding-bottom...');

  // Verify .terminal-view has padding-bottom of at least 6px (was fixed from 4px to 8px)
  const paddingBottom = await page.evaluate(() => {
    const termView = document.querySelector('.terminal-view');
    if (!termView) return -1;
    const computed = window.getComputedStyle(termView);
    return parseFloat(computed.paddingBottom);
  });

  expect(paddingBottom).toBeGreaterThanOrEqual(6);
});

test('terminal-padding: terminal content fills available space without overflow', async () => {
  // Verify the terminal-view-container takes full height and the xterm element fills it
  const layout = await page.evaluate(() => {
    const container = document.querySelector('.terminal-view-container');
    const termView = document.querySelector('.terminal-view');
    const xterm = document.querySelector('.terminal-view .xterm');
    if (!container || !termView || !xterm) return { ok: false };

    const containerRect = container.getBoundingClientRect();
    const xtermRect = xterm.getBoundingClientRect();

    return {
      ok: true,
      containerHeight: containerRect.height,
      xtermHeight: xtermRect.height,
      xtermFillsContainer: xtermRect.height > 0 && xtermRect.bottom <= containerRect.bottom + 1,
    };
  });

  expect(layout.ok).toBe(true);
  expect(layout.xtermFillsContainer).toBe(true);
});

test('terminal-padding: last line of output is fully visible after generating many lines', async () => {
  await showTestLabel(page, 'Terminal Padding\nChecking last line visibility...');

  // Generate enough output to fill the viewport
  await focusTerminal(page);
  await typeCommand(page, 'for i in $(seq 1 80); do echo "padding-test-line-$i"; done');
  await page.waitForTimeout(2000);

  // Type a unique marker on the last line
  await typeCommand(page, 'echo "LAST-LINE-MARKER-PADDING-XYZ"');
  await page.waitForTimeout(1000);

  // Check the marker is visible in the terminal viewport
  const markerVisible = await page.evaluate(() => {
    const termView = document.querySelector('.terminal-view');
    if (!termView) return false;
    const text = termView.textContent || '';
    return text.includes('LAST-LINE-MARKER-PADDING-XYZ');
  });
  expect(markerVisible).toBe(true);

  // Verify the bottom of the xterm viewport is within the container bounds
  const notClipped = await page.evaluate(() => {
    const container = document.querySelector('.terminal-view-container');
    if (!container) return false;
    const containerRect = container.getBoundingClientRect();

    // Check the xterm-rows element — the last rendered row
    const rows = container.querySelectorAll('.xterm-rows > div');
    if (rows.length === 0) return false;

    // Get the last row that has actual content (not just empty)
    let lastContentRow: Element | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const text = rows[i].textContent || '';
      if (text.trim()) {
        lastContentRow = rows[i];
        break;
      }
    }
    if (!lastContentRow) return false;

    const rowRect = lastContentRow.getBoundingClientRect();
    // The last content row bottom should not exceed the container bottom
    return rowRect.bottom <= containerRect.bottom + 2; // 2px tolerance
  });
  expect(notClipped).toBe(true);
});

test('terminal-padding: padding prevents statusbar overlap', async () => {
  // Verify the terminal-view bottom edge is above the status bar
  const noOverlap = await page.evaluate(() => {
    const termView = document.querySelector('.terminal-view');
    const statusbar = document.querySelector('.statusbar');
    if (!termView || !statusbar) return false;

    const termRect = termView.getBoundingClientRect();
    const statusBarRect = statusbar.getBoundingClientRect();

    // Terminal bottom should be at or above statusbar top
    return termRect.bottom <= statusBarRect.top + 1; // 1px tolerance
  });
  expect(noOverlap).toBe(true);
});

test('terminal-padding: terminal buffer rows fit within visible area', async () => {
  // Check that the number of visible rows in xterm matches the terminal dimensions
  const rowsFit = await page.evaluate(() => {
    const termView = document.querySelector('.terminal-view');
    if (!termView) return { ok: false };

    const xtermEl = termView.querySelector('.xterm');
    if (!xtermEl) return { ok: false };

    const xtermRect = xtermEl.getBoundingClientRect();
    const containerRect = termView.getBoundingClientRect();

    // The xterm element should fit within the terminal-view container
    const xtermFits = xtermRect.bottom <= containerRect.bottom + 1;

    return {
      ok: true,
      xtermBottom: xtermRect.bottom,
      containerBottom: containerRect.bottom,
      fits: xtermFits,
    };
  });

  expect(rowsFit.ok).toBe(true);
  expect(rowsFit.fits).toBe(true);
});
