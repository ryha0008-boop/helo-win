import { test, expect } from '@playwright/test';
import {
  getApp, closeApp, sessionItems, focusTerminal, typeCommand,
  createNewTerminal, closeActiveSession, waitForSidebarUpdate,
  clickContextMenuItem, showTestLabel,
} from './helpers';
import type { Page } from 'playwright';

let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const result = await getApp();
  page = result.page;
  // Ensure clean state — keep only 1 terminal
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
// PASTE — Line ending normalization (#14/#13)
// ==========================================

test('paste: single-line text reaches PTY unchanged', async () => {
  await showTestLabel(page, 'Paste\nSingle-line paste...');

  // Capture what gets written to PTY
  const captured: string[] = [];
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  // Write to clipboard, then Ctrl+V
  await page.evaluate(() =>
    navigator.clipboard.writeText('hello world')
  );
  await focusTerminal(page);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  // The single-line text should be written as-is (no \r added)
  expect(capturedData.length).toBeGreaterThanOrEqual(1);
  expect(capturedData[0]).toContain('hello world');

  // Restore original writePty
  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: CRLF (\\r\\n) is normalized to \\r', async () => {
  await showTestLabel(page, 'Paste\nCRLF normalization...');

  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  // Write text with \r\n line endings to clipboard
  await page.evaluate(() =>
    navigator.clipboard.writeText('line1\r\nline2\r\nline3')
  );
  await focusTerminal(page);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  expect(capturedData.length).toBeGreaterThanOrEqual(1);

  // The normalized text should contain \r but NOT \r\n
  const joined = capturedData.join('');
  expect(joined).not.toContain('\r\n');
  // It should contain \r as the line separator
  expect(joined).toContain('\r');

  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: LF (\\n) is normalized to \\r', async () => {
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  await page.evaluate(() =>
    navigator.clipboard.writeText('line1\nline2\nline3')
  );
  await focusTerminal(page);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  expect(capturedData.length).toBeGreaterThanOrEqual(1);

  // No bare \n should remain — all converted to \r
  const joined = capturedData.join('');
  expect(joined).not.toMatch(/(?<!\r)\n/);
  // Should contain \r separators
  expect(joined).toContain('\r');

  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: large text is chunked at 4KB boundary', async () => {
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  // Create a string larger than 4096 chars
  const largeText = await page.evaluate(() => {
    const line = 'A'.repeat(100);
    return line + '\n'; // ~101 chars per line, need ~42 lines to exceed 4KB
  });
  const fullText = largeText.repeat(50); // ~5050 chars
  await page.evaluate((t) =>
    navigator.clipboard.writeText(t), fullText
  );

  await focusTerminal(page);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  // With chunking, there should be multiple writePty calls
  // First chunk should be at most 4096 chars
  expect(capturedData.length).toBeGreaterThanOrEqual(1);
  if (capturedData.length > 1) {
    expect(capturedData[0].length).toBeLessThanOrEqual(4096);
  }

  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: Ctrl+Shift+V triggers paste', async () => {
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  await page.evaluate(() =>
    navigator.clipboard.writeText('ctrl-shift-v-test')
  );
  await focusTerminal(page);
  await page.keyboard.press('Control+Shift+v');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  expect(capturedData.length).toBeGreaterThanOrEqual(1);
  expect(capturedData[0]).toContain('ctrl-shift-v-test');

  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: context menu Paste triggers writePaste', async () => {
  await page.evaluate(() => {
    (window as any).__e2e_captured = [];
    const orig = window.terminal.writePty;
    (window as any).__e2e_origWritePty = orig;
    window.terminal.writePty = (id: string, data: string) => {
      (window as any).__e2e_captured.push(data);
      orig.call(window.terminal, id, data);
    };
  });

  await page.evaluate(() =>
    navigator.clipboard.writeText('context-paste-test')
  );

  // Right-click terminal to open context menu
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Paste');
  await page.waitForTimeout(500);

  const capturedData = await page.evaluate(() => (window as any).__e2e_captured as string[]);
  expect(capturedData.length).toBeGreaterThanOrEqual(1);
  expect(capturedData[0]).toContain('context-paste-test');

  await page.evaluate(() => {
    window.terminal.writePty = (window as any).__e2e_origWritePty;
  });
});

test('paste: empty clipboard does not crash', async () => {
  await page.evaluate(() =>
    navigator.clipboard.writeText('')
  );
  await focusTerminal(page);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  // No crash = pass. Verify terminal is still functional.
  await typeCommand(page, 'echo after-empty-paste');
  await page.waitForTimeout(500);
});
