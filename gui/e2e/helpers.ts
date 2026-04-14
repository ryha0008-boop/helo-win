import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';

let _app: ElectronApplication | null = null;
let _page: Page | null = null;

export async function getApp(): Promise<{ app: ElectronApplication; page: Page }> {
  if (_app && _page) return { app: _app, page: _page };

  const mainPath = path.resolve(__dirname, '../dist/main/main/index.js');

  _app = await electron.launch({
    args: [mainPath],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  _page = await _app.firstWindow();
  await _page.waitForLoadState('domcontentloaded');
  await _page.waitForSelector('.session-item', { timeout: 15000 });

  // Clear any persisted state
  await _page.evaluate(() => {
    localStorage.removeItem('session-pins');
    localStorage.removeItem('session-colors');
    localStorage.removeItem('session-groups');
    localStorage.removeItem('session-groups-collapsed');
  });

  return { app: _app, page: _page };
}

export async function closeApp() {
  if (_app) {
    // Force kill immediately — Electron's close dialog can hang
    try {
      const proc = _app.process();
      if (proc && !proc.killed) proc.kill();
    } catch {}
    _app = null;
    _page = null;
  }
}

export function sessionItems(page: Page) {
  return page.locator('.session-item:not(.session-child)');
}

export function splitChildren(page: Page) {
  return page.locator('.session-item.session-child');
}

export function sessionByName(page: Page, name: string) {
  return page.locator('.session-item:not(.session-child)', { hasText: name });
}

export async function rightClickSession(page: Page, name: string) {
  await sessionByName(page, name).click({ button: 'right' });
  await page.waitForSelector('.context-menu', { timeout: 2000 });
}

export async function clickContextMenuItem(page: Page, label: string) {
  await page.locator('.context-menu-item', { hasText: label }).click();
}

export async function waitForSidebarUpdate(page: Page, ms = 500) {
  await page.waitForTimeout(ms);
}

/**
 * Show a label overlay on the app window describing what's being tested.
 * Only shows when SLOW=1 is set.
 */
export async function showTestLabel(page: Page, text: string) {
  await page.evaluate((label) => {
    let el = document.getElementById('e2e-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'e2e-label';
      el.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85); color: #00e5ff; padding: 16px 32px;
        border-radius: 12px; font-size: 18px; font-family: 'Inter', sans-serif;
        font-weight: 600; z-index: 99999; pointer-events: none;
        border: 1px solid rgba(0,229,255,0.3);
        text-align: center; max-width: 80%; backdrop-filter: blur(8px);
      `;
      document.body.appendChild(el);
    }
    el.textContent = label;
    el.style.display = 'block';
  }, text);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const el = document.getElementById('e2e-label');
    if (el) el.style.display = 'none';
  });
}

/**
 * Focus the active terminal so keyboard input reaches xterm.js.
 * Clicks the terminal area twice with delays to ensure focus is captured.
 */
export async function focusTerminal(page: Page) {
  const terminal = page.locator('.terminal-view:visible');
  if (await terminal.count() > 0) {
    await terminal.first().click();
    await page.waitForTimeout(300);
    await terminal.first().click();
    await page.waitForTimeout(200);
  }
}

/**
 * Type a command into the focused terminal and press Enter.
 */
export async function typeCommand(page: Page, command: string) {
  await focusTerminal(page);
  await page.keyboard.type(command, { delay: 20 });
  await page.keyboard.press('Enter');
}

/**
 * Create a new terminal by clicking the + button in the title bar
 */
export async function createNewTerminal(page: Page) {
  await page.locator('.titlebar-action-btn[title*="New terminal"]').click();
  await page.waitForTimeout(1000);
}

/**
 * Close the active session by clicking the close button in sidebar
 */
export async function closeActiveSession(page: Page) {
  const closeBtn = page.locator('.session-item.active:not(.session-child) .session-close');
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
}
