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
// Bug #11 — Input freeze after `clear` command
// ==========================================

/**
 * Helper: check if the xterm terminal buffer contains a specific string.
 */
async function bufferContainsText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((searchText) => {
    const termView = document.querySelector('.terminal-view');
    if (!termView) return false;
    const textContent = termView.textContent || '';
    return textContent.includes(searchText);
  }, text);
}

/**
 * Helper: stub writePty to capture calls, returns an array reference.
 */
async function stubWritePty(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });
}

async function restoreWritePty(page: Page): Promise<void> {
  await page.evaluate(() => {
    if ((window as any).__e2e_origWritePty) {
      window.terminal.writePty = (window as any).__e2e_origWritePty;
    }
  });
}

async function getCapturedPtyData(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__e2e_captured as string[]);
}

test('clear-freeze: terminal accepts input after running `clear` command', async () => {
  await showTestLabel(page, 'Clear Freeze\nInput after shell clear...');

  // Run the `clear` command
  await focusTerminal(page);
  await typeCommand(page, 'clear');
  await page.waitForTimeout(1000);

  // Now type a command and verify output appears
  await typeCommand(page, 'echo "after-clear-works-123"');
  await page.waitForTimeout(1000);

  const found = await bufferContainsText(page, 'after-clear-works-123');
  expect(found).toBe(true);
});

test('clear-freeze: terminal accepts input after Ctrl+L', async () => {
  await showTestLabel(page, 'Clear Freeze\nInput after Ctrl+L...');

  // Type something so we know the terminal was alive before
  await focusTerminal(page);
  await typeCommand(page, 'echo "before-ctrl-l"');
  await page.waitForTimeout(1000);

  const beforeClear = await bufferContainsText(page, 'before-ctrl-l');
  expect(beforeClear).toBe(true);

  // Press Ctrl+L to clear
  await focusTerminal(page);
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(500);

  // Now type a command and verify output appears (no freeze)
  await typeCommand(page, 'echo "after-ctrl-l-works"');
  await page.waitForTimeout(1000);

  const found = await bufferContainsText(page, 'after-ctrl-l-works');
  expect(found).toBe(true);
});

test('clear-freeze: Ctrl+L sends form feed (\\x0c) to PTY', async () => {
  await showTestLabel(page, 'Clear Freeze\nCtrl+L sends \\x0c...');

  await stubWritePty(page);

  await focusTerminal(page);
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(500);

  const captured = await getCapturedPtyData(page);

  // Ctrl+L should send form feed (\x0c) to the PTY
  expect(captured).toContain('\x0c');

  await restoreWritePty(page);
});

test('clear-freeze: context menu Clear sends form feed to PTY', async () => {
  await showTestLabel(page, 'Clear Freeze\nContext menu sends \\x0c...');

  await stubWritePty(page);

  // Right-click terminal and select Clear
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Clear');
  await page.waitForTimeout(500);

  const captured = await getCapturedPtyData(page);

  // Context menu Clear should send form feed (\x0c) to the PTY
  expect(captured).toContain('\x0c');

  await restoreWritePty(page);
});

test('clear-freeze: multiple consecutive clears do not freeze', async () => {
  await showTestLabel(page, 'Clear Freeze\nMultiple clears...');

  // Clear 3 times consecutively
  await focusTerminal(page);

  // First clear — via shell command
  await typeCommand(page, 'clear');
  await page.waitForTimeout(800);

  // Second clear — via Ctrl+L
  await focusTerminal(page);
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(500);

  // Third clear — via Ctrl+L again
  await focusTerminal(page);
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(500);

  // Verify terminal is still responsive
  await typeCommand(page, 'echo "survived-triple-clear"');
  await page.waitForTimeout(1000);

  const found = await bufferContainsText(page, 'survived-triple-clear');
  expect(found).toBe(true);
});

test('clear-freeze: shell clear command followed by Ctrl+L works', async () => {
  await focusTerminal(page);

  // Shell clear
  await typeCommand(page, 'clear');
  await page.waitForTimeout(800);

  // Then Ctrl+L
  await focusTerminal(page);
  await page.keyboard.press('Control+l');
  await page.waitForTimeout(500);

  // Verify input works
  await typeCommand(page, 'echo "mixed-clear-ok"');
  await page.waitForTimeout(1000);

  const found = await bufferContainsText(page, 'mixed-clear-ok');
  expect(found).toBe(true);
});
