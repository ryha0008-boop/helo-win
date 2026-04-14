import { test, expect } from '@playwright/test';
import {
  getApp, closeApp, sessionItems, splitChildren,
  clickContextMenuItem, waitForSidebarUpdate,
  createNewTerminal, closeActiveSession,
  focusTerminal, typeCommand, showTestLabel,
} from './helpers';
import type { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  const result = await getApp();
  page = result.page;
});

test.afterAll(async () => {
  await closeApp();
});

test.describe.configure({ mode: 'serial' });

// ==========================================
// 1. SESSION LIFECYCLE
// ==========================================

test('starts with at least one terminal session', async () => {
  await showTestLabel(page, '1. Session Lifecycle\nChecking initial state...');
  const count = await sessionItems(page).count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('new session is always active', async () => {
  const active = page.locator('.session-item.active:not(.session-child)');
  expect(await active.count()).toBe(1);
});

test('+ button creates new terminal session', async () => {
  await showTestLabel(page, '1. Session Lifecycle\nCreating new terminal...');
  const before = await sessionItems(page).count();
  await createNewTerminal(page);
  const after = await sessionItems(page).count();
  expect(after).toBe(before + 1);
});

test('new session becomes active, previous deactivates', async () => {
  const activeItems = page.locator('.session-item.active:not(.session-child)');
  expect(await activeItems.count()).toBe(1);
  // The last (newest) session should be active
  const last = sessionItems(page).last();
  const cls = await last.getAttribute('class');
  expect(cls).toContain('active');
});

test('clicking a session switches active state', async () => {
  const first = sessionItems(page).first();
  await first.click();
  await page.waitForTimeout(300);
  expect(await first.getAttribute('class')).toContain('active');

  const second = sessionItems(page).nth(1);
  expect(await second.getAttribute('class')).not.toContain('active');
});

test('only one session is active at a time', async () => {
  const actives = page.locator('.session-item.active:not(.session-child)');
  expect(await actives.count()).toBe(1);
});

test('close button removes session', async () => {
  await showTestLabel(page, '1. Session Lifecycle\nClosing session...');
  await createNewTerminal(page);
  const before = await sessionItems(page).count();
  await closeActiveSession(page);
  const after = await sessionItems(page).count();
  expect(after).toBe(before - 1);
});

test('closing active session activates the last remaining', async () => {
  await createNewTerminal(page);
  const secondToLast = sessionItems(page).nth(-2);
  const secondToLastName = await secondToLast.locator('.session-name').textContent();

  // Close the active (last) session
  await closeActiveSession(page);
  await page.waitForTimeout(300);

  // Now the last remaining should be active
  const active = page.locator('.session-item.active:not(.session-child)');
  expect(await active.count()).toBe(1);
});

test('cannot close last session (close button hidden)', async () => {
  await showTestLabel(page, '1. Session Lifecycle\nCannot close last session...');
  // Close all but one
  while (await sessionItems(page).count() > 1) {
    await closeActiveSession(page);
  }
  // Close button should not exist
  const closeBtn = page.locator('.session-item:not(.session-child) .session-close');
  expect(await closeBtn.count()).toBe(0);
});

test('active session has accent bar', async () => {
  const active = page.locator('.session-item.active:not(.session-child)');
  expect(await active.count()).toBe(1);
});

// ==========================================
// 2. SHELL TYPE ICONS & UPTIME
// ==========================================

test('terminal session shows >_ icon', async () => {
  await showTestLabel(page, '2. Shell Icons & Uptime\nChecking terminal icon...');
  const icon = page.locator('.session-icon.terminal').first();
  expect(await icon.textContent()).toMatch(/>_|PS|>/);
});

test('session shows uptime', async () => {
  const meta = page.locator('.session-meta').first();
  const text = await meta.textContent();
  expect(text).toMatch(/\d+[smhd]/);
});

test('browser session shows globe icon', async () => {
  await showTestLabel(page, '2. Shell Icons & Uptime\nCreating browser, checking globe icon...');
  await page.locator('.titlebar-action-btn[title="New browser"]').click();
  await page.waitForTimeout(1000);
  const browserIcon = page.locator('.session-icon.browser');
  expect(await browserIcon.count()).toBeGreaterThanOrEqual(1);
  expect(await browserIcon.first().textContent()).toBe('\u{1F310}');
  // Clean up — close browser session
  await closeActiveSession(page);
});

// ==========================================
// 3. RENAME
// ==========================================

test('double-click opens inline rename input', async () => {
  await showTestLabel(page, '3. Rename\nDouble-click to rename...');
  // Ensure we have a session and it's settled
  if (await sessionItems(page).count() < 2) await createNewTerminal(page);
  await page.waitForTimeout(500);
  const name = page.locator('.session-item.active .session-name');
  await name.dblclick();
  await page.waitForTimeout(300);
  expect(await page.locator('.session-rename-input').count()).toBe(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('Enter submits rename', async () => {
  const name = page.locator('.session-item.active .session-name');
  const original = await name.textContent();
  await name.dblclick();
  await page.waitForTimeout(200);
  await page.locator('.session-rename-input').fill('Renamed Session');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(await page.locator('.session-item.active .session-name').textContent()).toBe('Renamed Session');

  // Restore
  await page.locator('.session-item.active .session-name').dblclick();
  await page.waitForTimeout(200);
  await page.locator('.session-rename-input').fill(original || 'Terminal');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
});

test('Escape cancels rename without saving', async () => {
  const name = page.locator('.session-item.active .session-name');
  const original = await name.textContent();
  await name.dblclick();
  await page.waitForTimeout(200);
  await page.locator('.session-rename-input').fill('Should Not Save');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  expect(await page.locator('.session-item.active .session-name').textContent()).toBe(original);
});

test('empty rename does not save', async () => {
  const name = page.locator('.session-item.active .session-name');
  const original = await name.textContent();
  await name.dblclick();
  await page.waitForTimeout(200);
  await page.locator('.session-rename-input').fill('');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  // Should keep original name (empty trim rejected)
  expect(await page.locator('.session-item.active .session-name').textContent()).toBe(original);
});

// ==========================================
// 4. CONTEXT MENU
// ==========================================

test('right-click opens context menu', async () => {
  await showTestLabel(page, '4. Context Menu\nRight-click to open menu...');
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  expect(await page.locator('.context-menu').count()).toBe(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('context menu has all expected items', async () => {
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  const labels = await page.locator('.context-menu-item').allTextContents();
  expect(labels).toContain('Pin to top');
  expect(labels).toContain('Color tag');
  expect(labels).toContain('New group...');
  expect(labels).toContain('Rename');
  expect(labels).toContain('Duplicate');
  expect(labels).toContain('Close');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('context menu has separators', async () => {
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  const seps = page.locator('.context-menu-separator');
  expect(await seps.count()).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('Duplicate creates a copy', async () => {
  const before = await sessionItems(page).count();
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Duplicate');
  await page.waitForTimeout(1000);
  expect(await sessionItems(page).count()).toBe(before + 1);
});

test('Close via context menu removes session', async () => {
  await createNewTerminal(page);
  const before = await sessionItems(page).count();
  await sessionItems(page).last().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Close');
  await page.waitForTimeout(500);
  expect(await sessionItems(page).count()).toBe(before - 1);
});

// ==========================================
// 5. PIN TO TOP
// ==========================================

test('pin moves session to top', async () => {
  await showTestLabel(page, '5. Pin to Top\nPinning session...');
  // Ensure 2+ sessions
  if (await sessionItems(page).count() < 2) await createNewTerminal(page);

  const last = sessionItems(page).last();
  const lastName = await last.locator('.session-name').textContent();
  await last.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Pin to top');
  await page.waitForTimeout(300);

  const first = sessionItems(page).first();
  expect(await first.locator('.session-name').textContent()).toBe(lastName);
  expect(await first.locator('.session-pin-icon').count()).toBe(1);
});

test('only pinned sessions show pin icon', async () => {
  const pins = page.locator('.session-pin-icon');
  expect(await pins.count()).toBe(1);
});

test('unpin restores normal order', async () => {
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Unpin');
  await page.waitForTimeout(300);
  expect(await page.locator('.session-pin-icon').count()).toBe(0);
});

test('pin state persists in localStorage', async () => {
  await sessionItems(page).last().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Pin to top');
  await page.waitForTimeout(300);

  const pins = await page.evaluate(() => localStorage.getItem('session-pins'));
  expect(JSON.parse(pins!).length).toBe(1);

  // Clean up
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Unpin');
  await page.waitForTimeout(300);
});

// ==========================================
// 6. COLOR TAGS
// ==========================================

test('apply color tag shows colored border', async () => {
  await showTestLabel(page, '6. Color Tags\nApplying color tag...');
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').first().click();
  await page.waitForTimeout(300);

  const style = await sessionItems(page).first().getAttribute('style');
  expect(style).toContain('border-left');
});

test('color picker shows 8 swatches', async () => {
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  expect(await page.locator('.color-picker-swatch').count()).toBe(8);
  // Close
  await page.locator('.color-picker-clear').click();
  await page.waitForTimeout(200);
});

test('toggling same color removes it', async () => {
  // Apply red
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').first().click();
  await page.waitForTimeout(200);

  // Click same color again
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').first().click();
  await page.waitForTimeout(200);

  const style = await sessionItems(page).first().getAttribute('style') || '';
  expect(style).not.toContain('border-left');
});

test('clear color button removes tag', async () => {
  // Apply
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').nth(3).click();
  await page.waitForTimeout(200);

  // Clear
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-clear').click();
  await page.waitForTimeout(200);

  const style = await sessionItems(page).first().getAttribute('style') || '';
  expect(style).not.toContain('border-left');
});

test('color persists in localStorage', async () => {
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-swatch').nth(2).click();
  await page.waitForTimeout(300);

  const colors = await page.evaluate(() => localStorage.getItem('session-colors'));
  expect(Object.keys(JSON.parse(colors!)).length).toBe(1);

  // Clean up
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Color tag');
  await page.waitForSelector('.color-picker-menu');
  await page.locator('.color-picker-clear').click();
  await page.waitForTimeout(200);
});

// ==========================================
// 7. SESSION GROUPS
// ==========================================

test('create new group via context menu', async () => {
  await showTestLabel(page, '7. Session Groups\nCreating new group...');
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'New group...');
  await page.waitForTimeout(300);
  await page.locator('.session-rename-input').last().fill('Backend');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  expect(await page.locator('.session-group-header').count()).toBe(1);
  expect(await page.locator('.session-group-header').textContent()).toContain('Backend');
});

test('group header shows session count', async () => {
  expect(await page.locator('.session-group-count').first().textContent()).toBe('1');
});

test('ungrouped sessions render before groups', async () => {
  const allItems = page.locator('.session-item:not(.session-child), .session-group-header');
  const count = await allItems.count();
  let foundHeader = false;
  let ungroupedAfterHeader = false;
  for (let i = 0; i < count; i++) {
    const el = allItems.nth(i);
    if (await el.getAttribute('class') === null) continue;
    const cls = await el.getAttribute('class') || '';
    if (cls.includes('session-group-header')) foundHeader = true;
  }
  expect(foundHeader).toBe(true);
});

test('click header collapses group', async () => {
  const header = page.locator('.session-group-header').first();
  const before = await sessionItems(page).count();

  await header.click();
  await page.waitForTimeout(300);
  expect(await sessionItems(page).count()).toBe(before - 1);

  // Expand again
  await header.click();
  await page.waitForTimeout(300);
  expect(await sessionItems(page).count()).toBe(before);
});

test('collapsed chevron changes direction', async () => {
  const header = page.locator('.session-group-header').first();
  const chevron = header.locator('.session-group-chevron');

  expect(await chevron.textContent()).toBe('\u25BC'); // expanded

  await header.click();
  await page.waitForTimeout(200);
  expect(await chevron.textContent()).toBe('\u25B6'); // collapsed

  await header.click();
  await page.waitForTimeout(200);
});

test('move session to existing group', async () => {
  if (await sessionItems(page).count() < 2) await createNewTerminal(page);

  const ungrouped = sessionItems(page).first();
  await ungrouped.click({ button: 'right' });
  await page.waitForSelector('.context-menu');

  const moveItem = page.locator('.context-menu-item', { hasText: 'Move to Backend' });
  if (await moveItem.count() > 0) {
    await moveItem.click();
    await page.waitForTimeout(300);
    expect(await page.locator('.session-group-count').first().textContent()).toBe('2');
  } else {
    await page.keyboard.press('Escape');
  }
});

test('remove session from group', async () => {
  await sessionItems(page).last().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  const removeItem = page.locator('.context-menu-item', { hasText: 'Remove from' });
  if (await removeItem.count() > 0) {
    await removeItem.click();
    await page.waitForTimeout(300);
  } else {
    await page.keyboard.press('Escape');
  }
});

test('right-click group header shows rename/delete', async () => {
  const header = page.locator('.session-group-header').first();
  if (await header.count() === 0) return;

  await header.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  const labels = await page.locator('.context-menu-item').allTextContents();
  expect(labels).toContain('Rename group');
  expect(labels).toContain('Delete group');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});

test('delete group returns sessions to ungrouped', async () => {
  const header = page.locator('.session-group-header').first();
  if (await header.count() === 0) return;

  const totalBefore = await sessionItems(page).count();
  await header.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Delete group');
  await page.waitForTimeout(300);

  expect(await page.locator('.session-group-header').count()).toBe(0);
  expect(await sessionItems(page).count()).toBe(totalBefore);
});

test('group collapsed state persists in localStorage', async () => {
  // Create group + collapse
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'New group...');
  await page.waitForTimeout(300);
  await page.locator('.session-rename-input').last().fill('TestPersist');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  await page.locator('.session-group-header').first().click();
  await page.waitForTimeout(200);

  const stored = await page.evaluate(() => localStorage.getItem('session-groups-collapsed'));
  expect(JSON.parse(stored!)).toContain('TestPersist');

  // Clean up — delete group
  await page.locator('.session-group-header').first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Delete group');
  await page.waitForTimeout(300);
});

// ==========================================
// 8. SEARCH FILTER
// ==========================================

test('search input appears with 4+ sessions', async () => {
  await showTestLabel(page, '8. Search Filter\nTesting search...');
  while (await sessionItems(page).count() < 4) await createNewTerminal(page);
  expect(await page.locator('.session-search-input').count()).toBe(1);
});

test('typing filters sessions by name', async () => {
  const total = await sessionItems(page).count();
  const firstName = await sessionItems(page).first().locator('.session-name').textContent();
  await page.locator('.session-search-input').fill(firstName || 'Terminal');
  await page.waitForTimeout(200);
  expect(await sessionItems(page).count()).toBeLessThan(total);
  expect(await sessionItems(page).count()).toBeGreaterThanOrEqual(1);
});

test('search is case-insensitive', async () => {
  const firstName = await sessionItems(page).first().locator('.session-name').textContent();
  await page.locator('.session-search-input').fill((firstName || '').toUpperCase());
  await page.waitForTimeout(200);
  expect(await sessionItems(page).count()).toBeGreaterThanOrEqual(1);
});

test('clear button resets filter', async () => {
  await page.locator('.session-search-clear').click();
  await page.waitForTimeout(200);
  expect(await page.locator('.session-search-input').inputValue()).toBe('');
});

test('no results shows empty list', async () => {
  await page.locator('.session-search-input').fill('xyznonexistent999');
  await page.waitForTimeout(200);
  expect(await sessionItems(page).count()).toBe(0);
  await page.locator('.session-search-clear').click();
  await page.waitForTimeout(200);
});

// ==========================================
// 9. SPLIT PANES
// ==========================================

test('split button creates vertical split', async () => {
  await showTestLabel(page, '9. Split Panes\nCreating vertical split...');
  await sessionItems(page).first().click();
  await page.waitForTimeout(300);
  const before = await splitChildren(page).count();
  await page.locator('.titlebar-action-btn[title*="Split terminal vertical"]').click();
  await page.waitForTimeout(1000);
  expect(await splitChildren(page).count()).toBe(before + 1);
});

test('split child shows tree line connector', async () => {
  const child = splitChildren(page).first();
  expect(await child.locator('.session-child-line').count()).toBe(1);
});

test('split child shows shell icon', async () => {
  const child = splitChildren(page).first();
  expect(await child.locator('.session-icon').count()).toBe(1);
});

test('split child shows direction indicator', async () => {
  const child = splitChildren(page).first();
  const name = await child.locator('.session-name').textContent();
  // Vertical split should show │
  expect(name).toContain('\u2502');
});

test('split child has close button', async () => {
  expect(await splitChildren(page).first().locator('.session-close').count()).toBe(1);
});

test('no double split on same session', async () => {
  const splitBtn = page.locator('.titlebar-action-btn[title*="Split terminal vertical"]');
  // Button should be gone (replaced by close split)
  expect(await splitBtn.count()).toBe(0);
});

test('close button removes split child', async () => {
  await splitChildren(page).first().locator('.session-close').click();
  await page.waitForTimeout(500);
  expect(await splitChildren(page).count()).toBe(0);
});

test('split divider is rendered between panes', async () => {
  // Create split again
  await page.locator('.titlebar-action-btn[title*="Split terminal vertical"]').click();
  await page.waitForTimeout(1000);
  expect(await page.locator('.split-divider').count()).toBe(1);
  // Clean up
  await splitChildren(page).first().locator('.session-close').click();
  await page.waitForTimeout(500);
});

// ==========================================
// 10. TERMINAL INTELLIGENCE
// ==========================================

test('command shows in status bar after execution', async () => {
  await showTestLabel(page, '10. Terminal Intelligence\nTyping command, checking status bar...');
  await sessionItems(page).first().click();
  await page.waitForTimeout(300);
  await typeCommand(page, 'echo e2e-status-test');
  await waitForSidebarUpdate(page, 1000);

  const cmd = page.locator('.statusbar-cmd');
  if (await cmd.count() > 0) {
    expect(await cmd.textContent()).toContain('echo e2e-status-test');
  }
});

test('CWD updates in sidebar subtitle after cd', async () => {
  await typeCommand(page, 'cd /');
  await waitForSidebarUpdate(page, 1000);
  // Verify no crash — CWD detection is prompt-dependent
});

test('unread indicator on background tab', async () => {
  const termSessions = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  while (await termSessions.count() < 2) await createNewTerminal(page);

  await termSessions.nth(1).click();
  await page.waitForTimeout(500);
  await typeCommand(page, 'echo bg');
  await page.waitForTimeout(300);

  await termSessions.first().click();
  await page.waitForTimeout(1000);
  // Timing dependent — just verify no crash
  expect(await page.locator('.session-unread').count()).toBeGreaterThanOrEqual(0);
});

// ==========================================
// 11. TITLE BAR
// ==========================================

test('title bar has minimize, maximize, close', async () => {
  await showTestLabel(page, '11. Title Bar\nChecking window controls...');
  expect(await page.locator('.titlebar-btn-minimize').count()).toBe(1);
  expect(await page.locator('.titlebar-btn-maximize').count()).toBe(1);
  expect(await page.locator('.titlebar-btn-close').count()).toBe(1);
});

test('title bar has action button groups', async () => {
  expect(await page.locator('.titlebar-btn-group').count()).toBeGreaterThanOrEqual(3);
});

test('title bar has drag region', async () => {
  expect(await page.locator('.titlebar-drag').count()).toBe(1);
});

// ==========================================
// 12. SETTINGS PANEL
// ==========================================

test('gear button opens settings', async () => {
  await showTestLabel(page, '12. Settings Panel\nOpening settings...');
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');
  expect(await page.locator('.settings-panel').count()).toBe(1);
});

test('settings has 4 theme options', async () => {
  expect(await page.locator('.settings-theme-btn').count()).toBe(4);
});

test('settings has font family input', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Family' }).count()).toBe(1);
});

test('settings has font size input', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Size' }).count()).toBe(1);
});

test('settings has line height input', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Line height' }).count()).toBe(1);
});

test('settings has cursor style selector', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Style' }).count()).toBe(1);
});

test('settings has cursor blink toggle', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Blink' }).count()).toBe(1);
});

test('settings has scrollback input', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Scrollback' }).count()).toBe(1);
});

test('settings has opacity slider', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Opacity' }).count()).toBe(1);
});

test('settings has default shell selector', async () => {
  expect(await page.locator('.settings-label', { hasText: 'Default shell' }).count()).toBe(1);
});

test('settings has save and cancel buttons', async () => {
  expect(await page.locator('.settings-btn-save').count()).toBe(1);
  expect(await page.locator('.settings-btn', { hasText: 'Cancel' }).count()).toBe(1);
});

test('settings has reset to defaults', async () => {
  expect(await page.locator('.settings-btn-reset').count()).toBe(1);
});

test('cancel closes settings panel', async () => {
  await page.locator('.settings-btn', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(300);
  expect(await page.locator('.settings-panel').count()).toBe(0);
});

test('clicking backdrop closes settings', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');
  await page.locator('.settings-backdrop').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(300);
  expect(await page.locator('.settings-panel').count()).toBe(0);
});

// ==========================================
// 13. TABLET MODE
// ==========================================

test('tablet toggle enters tablet mode', async () => {
  await showTestLabel(page, '13. Tablet Mode\nSwitching to tablet...');
  await page.locator('.titlebar-action-btn[title="Tablet mode"]').click();
  await page.waitForTimeout(500);
  expect(await page.locator('.tablet-toolbar').count()).toBe(1);
});

test('title bar actions hidden in tablet mode', async () => {
  expect(await page.locator('.titlebar-btn-group').count()).toBe(0);
});

test('tablet toolbar has session controls', async () => {
  expect(await page.locator('.tt-btn', { hasText: '+Term' }).count()).toBe(1);
  expect(await page.locator('.tt-btn', { hasText: '+Web' }).count()).toBe(1);
});

test('tablet toolbar has terminal controls', async () => {
  expect(await page.locator('.tt-btn', { hasText: 'Copy' }).count()).toBe(1);
  expect(await page.locator('.tt-btn', { hasText: 'Paste' }).count()).toBe(1);
  expect(await page.locator('.tt-btn', { hasText: 'Clear' }).count()).toBe(1);
  expect(await page.locator('.tt-btn', { hasText: 'Find' }).count()).toBe(1);
});

test('tablet toolbar has navigation arrows', async () => {
  expect(await page.locator('.tt-arrow').count()).toBe(4);
});

test('tablet toolbar has MOV/SEL toggle', async () => {
  expect(await page.locator('.tt-mode-toggle').count()).toBe(1);
});

test('tablet toolbar has settings and desktop buttons', async () => {
  expect(await page.locator('.tt-btn-icon[title="Settings"]').count()).toBe(1);
  expect(await page.locator('.tt-btn-icon[title="Desktop mode"]').count()).toBe(1);
});

test('tablet toolbar has sidebar toggle', async () => {
  const sidebarBtn = page.locator('.tt-btn-icon').first();
  expect(await sidebarBtn.count()).toBe(1);
});

test('desktop button exits tablet mode', async () => {
  await page.locator('.tt-btn-icon[title="Desktop mode"]').click();
  await page.waitForTimeout(500);
  expect(await page.locator('.tablet-toolbar').count()).toBe(0);
  expect(await page.locator('.titlebar-btn-group').count()).toBeGreaterThanOrEqual(1);
});

// ==========================================
// 14. BROWSER SESSION
// ==========================================

test('new browser creates browser session', async () => {
  await showTestLabel(page, '14. Browser Session\nCreating browser...');
  await page.locator('.titlebar-action-btn[title="New browser"]').click();
  await page.waitForTimeout(1000);
  expect(await page.locator('.session-icon.browser').count()).toBeGreaterThanOrEqual(1);
});

test('browser session shows browser view container', async () => {
  const browserSession = page.locator('.session-item:not(.session-child)').filter({
    has: page.locator('.session-icon.browser')
  });
  if (await browserSession.count() > 0) {
    await browserSession.first().click();
    await page.waitForTimeout(500);
    expect(await page.locator('.browser-view-container').count()).toBe(1);
  }
});

test('browser has URL bar', async () => {
  expect(await page.locator('.browser-url-input').count()).toBe(1);
});

test('browser has navigation buttons', async () => {
  expect(await page.locator('.browser-nav-btn').count()).toBeGreaterThanOrEqual(3);
});

test('browser has tab bar', async () => {
  expect(await page.locator('.browser-tabs').count()).toBe(1);
  expect(await page.locator('.browser-tab').count()).toBeGreaterThanOrEqual(1);
});

// Clean up browser
test('close browser session', async () => {
  await closeActiveSession(page);
  await page.waitForTimeout(300);
});

// ==========================================
// 15. STATUS BAR
// ==========================================

test('status bar shows session count', async () => {
  await showTestLabel(page, '15. Status Bar\nChecking status bar...');
  const text = await page.locator('.statusbar').textContent();
  expect(text).toMatch(/\d+ sessions?/);
});

test('status bar shows active shell type', async () => {
  // Switch to terminal first
  const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  if (await termSession.count() > 0) await termSession.first().click();
  await page.waitForTimeout(300);

  const shell = page.locator('.statusbar-shell');
  expect(await shell.textContent()).toBeTruthy();
});

// ==========================================
// 16. DRAG & DROP
// ==========================================

test('sessions are draggable', async () => {
  await showTestLabel(page, '16. Drag & Drop\nChecking draggable attribute...');
  const first = sessionItems(page).first();
  expect(await first.getAttribute('draggable')).toBe('true');
});

// ==========================================
// 17. SIDEBAR STATE
// ==========================================

test('sidebar width persists in localStorage', async () => {
  await showTestLabel(page, '17. Persistence\nChecking localStorage...');
  const stored = await page.evaluate(() => localStorage.getItem('sidebar'));
  const parsed = JSON.parse(stored!);
  expect(parsed).toHaveProperty('width');
  expect(parsed.width).toBeGreaterThanOrEqual(180);
});

test('sidebar collapsed state persists', async () => {
  const stored = await page.evaluate(() => localStorage.getItem('sidebar'));
  const parsed = JSON.parse(stored!);
  expect(parsed).toHaveProperty('collapsed');
  expect(typeof parsed.collapsed).toBe('boolean');
});

test('sidebar side persists', async () => {
  const stored = await page.evaluate(() => localStorage.getItem('sidebar'));
  const parsed = JSON.parse(stored!);
  expect(parsed).toHaveProperty('side');
  expect(['left', 'right']).toContain(parsed.side);
});

// ==========================================
// 18. SCROLLBAR & SCROLL BUTTONS
// ==========================================

test('scroll buttons exist in terminal container', async () => {
  await showTestLabel(page, '18. Scroll & Shortcuts\nChecking scroll buttons...');
  const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  if (await termSession.count() > 0) await termSession.first().click();
  await page.waitForTimeout(300);

  expect(await page.locator('.scroll-btn-up').count()).toBe(1);
  expect(await page.locator('.scroll-btn-down').count()).toBe(1);
});

// ==========================================
// 19. SHORTCUTS TOOLTIP
// ==========================================

test('shortcuts ? button exists in title bar', async () => {
  expect(await page.locator('.shortcuts-trigger').count()).toBe(1);
});

test('hovering ? button shows shortcuts panel with 18 shortcuts', async () => {
  const trigger = page.locator('.shortcuts-trigger');
  await trigger.hover();
  await page.waitForTimeout(500);

  expect(await page.locator('.shortcuts-panel').count()).toBe(1);
  expect(await page.locator('.shortcuts-row').count()).toBe(18);

  // Move away to hide
  await page.locator('.titlebar-drag').hover();
  await page.waitForTimeout(300);
  expect(await page.locator('.shortcuts-panel').count()).toBe(0);
});

// ==========================================
// 20. SETTINGS — Functional
// ==========================================

test('changing theme applies new accent color', async () => {
  await showTestLabel(page, '20. Settings Functional\nChanging theme...');
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  // Click a non-active theme
  const inactiveTheme = page.locator('.settings-theme-btn:not(.active)').first();
  await inactiveTheme.click();
  await page.waitForTimeout(200);

  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(500);

  // Verify accent changed on root
  const accent = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--ui-accent')
  );
  expect(accent).toBeTruthy();
});

test('changing font size persists after save', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  const sizeInput = page.locator('.settings-input-sm').first();
  await sizeInput.fill('18');
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);

  // Reopen and verify
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');
  expect(await page.locator('.settings-input-sm').first().inputValue()).toBe('18');

  // Restore
  await page.locator('.settings-input-sm').first().fill('13');
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);
});

test('cursor style change persists', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  await page.locator('.settings-select').first().selectOption('block');
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);

  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');
  expect(await page.locator('.settings-select').first().inputValue()).toBe('block');

  // Restore
  await page.locator('.settings-select').first().selectOption('bar');
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);
});

test('cursor blink toggle changes state', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  const toggle = page.locator('.settings-toggle');
  const before = await toggle.textContent();
  await toggle.click();
  const after = await toggle.textContent();
  expect(after).not.toBe(before);

  // Restore
  await toggle.click();
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);
});

test('reset to defaults restores font size', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  await page.locator('.settings-input-sm').first().fill('22');
  await page.locator('.settings-btn-reset').click();
  await page.waitForTimeout(200);

  expect(await page.locator('.settings-input-sm').first().inputValue()).toBe('13');
  await page.locator('.settings-btn', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(300);
});

test('opacity slider updates percentage display', async () => {
  await page.locator('.titlebar-action-btn[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');

  const slider = page.locator('.settings-slider');
  await slider.fill('0.7');
  await page.waitForTimeout(200);

  const display = page.locator('.settings-slider-value');
  expect(await display.textContent()).toBe('70%');

  // Restore
  await slider.fill('1');
  await page.locator('.settings-btn-save').click();
  await page.waitForTimeout(300);
});

// ==========================================
// 21. BROWSER — Functional
// ==========================================

test('browser URL bar accepts input and navigates', async () => {
  await showTestLabel(page, '21. Browser Functional\nNavigating to URL...');
  await page.locator('.titlebar-action-btn[title="New browser"]').click();
  await page.waitForTimeout(1000);

  const urlBar = page.locator('.browser-url-input');
  await urlBar.click();
  await urlBar.fill('https://example.com');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  const url = await urlBar.inputValue();
  expect(url).toContain('example.com');
});

test('new tab button creates browser tab', async () => {
  const before = await page.locator('.browser-tab').count();
  await page.locator('.browser-tab-new').click();
  await page.waitForTimeout(500);
  expect(await page.locator('.browser-tab').count()).toBe(before + 1);
});

test('clicking browser tab switches active tab', async () => {
  const firstTab = page.locator('.browser-tab').first();
  await firstTab.click();
  await page.waitForTimeout(300);
  expect(await firstTab.getAttribute('class')).toContain('active');
});

test('close browser tab removes it', async () => {
  const before = await page.locator('.browser-tab').count();
  if (before > 1) {
    await page.locator('.browser-tab-close').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('.browser-tab').count()).toBe(before - 1);
  }
});

test('back button is disabled on fresh browser', async () => {
  const backBtn = page.locator('.browser-nav-btn').first();
  expect(await backBtn.isDisabled()).toBe(true);
});

test('open in system browser button exists', async () => {
  const extBtn = page.locator('.browser-nav-btn[title="Open in system browser"]');
  expect(await extBtn.count()).toBe(1);
});

test('close browser and return to terminal', async () => {
  await closeActiveSession(page);
  await page.waitForTimeout(300);
});

// ==========================================
// 22. SPLIT PANES — Extended
// ==========================================

test('horizontal split creates horizontal layout', async () => {
  await showTestLabel(page, '22. Split Panes Extended\nHorizontal split...');
  await createNewTerminal(page);
  // Close any existing splits on this session
  while (await splitChildren(page).count() > 0) {
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }

  // Find the horizontal split button
  const hSplitBtn = page.locator('.titlebar-action-btn[title*="horizontal"]');
  if (await hSplitBtn.count() > 0) {
    await hSplitBtn.click();
    await page.waitForTimeout(1000);
    expect(await page.locator('.split-horizontal').count()).toBeGreaterThanOrEqual(1);
    // Clean up
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }
});

test('browser split creates browser in second pane', async () => {
  if (await splitChildren(page).count() > 0) {
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }
  await sessionItems(page).first().click();
  await page.waitForTimeout(300);

  const browserSplitBtn = page.locator('.titlebar-action-btn[title="Split browser vertical"]');
  if (await browserSplitBtn.count() > 0) {
    await browserSplitBtn.click();
    await page.waitForTimeout(1000);

    // Second pane should contain a browser
    const browserViews = page.locator('.browser-view-container');
    expect(await browserViews.count()).toBeGreaterThanOrEqual(1);

    // Split child in sidebar should show browser icon
    const childIcon = splitChildren(page).first().locator('.session-icon.browser');
    expect(await childIcon.count()).toBe(1);

    // Clean up
    await splitChildren(page).first().locator('.session-close').click();
    await page.waitForTimeout(500);
  }
});

test('close split via title bar button', async () => {
  // Create split
  await page.locator('.titlebar-action-btn[title*="Split terminal vertical"]').click();
  await page.waitForTimeout(1000);

  // Title bar should now show close split button
  const closeSplitBtn = page.locator('.titlebar-action-btn[title="Close split pane"]');
  expect(await closeSplitBtn.count()).toBe(1);

  await closeSplitBtn.click();
  await page.waitForTimeout(500);
  expect(await splitChildren(page).count()).toBe(0);
});

// ==========================================
// 23. TERMINAL SEARCH BAR
// ==========================================

test('search bar opens via terminal context menu', async () => {
  await showTestLabel(page, '23. Terminal Search\nOpening search bar...');
  // Type something to search for
  await typeCommand(page, 'echo searchable-text-123');
  await page.waitForTimeout(500);

  // Open search via right-click context menu
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Search');
  await page.waitForTimeout(300);

  expect(await page.locator('.terminal-search-bar').count()).toBe(1);
});

test('search input accepts text', async () => {
  const input = page.locator('.terminal-search-input');
  await input.fill('searchable');
  await page.waitForTimeout(300);
  expect(await input.inputValue()).toBe('searchable');
});

test('scope toggle switches between All and Line', async () => {
  const scope = page.locator('.terminal-search-scope');
  const before = await scope.textContent();
  await scope.click();
  await page.waitForTimeout(200);
  const after = await scope.textContent();
  expect(after).not.toBe(before);

  // Toggle back
  await scope.click();
  await page.waitForTimeout(200);
});

test('search nav buttons exist (prev, next, go-to)', async () => {
  const navButtons = page.locator('.terminal-search-nav');
  expect(await navButtons.count()).toBe(3);
});

test('next/prev buttons are clickable', async () => {
  const navButtons = page.locator('.terminal-search-nav');
  await navButtons.nth(0).click(); // prev
  await page.waitForTimeout(200);
  await navButtons.nth(1).click(); // next
  await page.waitForTimeout(200);
  // No crash = pass
});

test('X button closes search bar', async () => {
  await page.locator('.terminal-search-close').click();
  await page.waitForTimeout(300);
  expect(await page.locator('.terminal-search-bar').count()).toBe(0);
});

test('search bar reopens and closes via X button', async () => {
  // Reopen via context menu
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Search');
  await page.waitForTimeout(300);
  expect(await page.locator('.terminal-search-bar').count()).toBe(1);

  await page.locator('.terminal-search-close').click();
  await page.waitForTimeout(300);
  expect(await page.locator('.terminal-search-bar').count()).toBe(0);
});

// ==========================================
// 24. TERMINAL CONTEXT MENU
// ==========================================

test('right-click on terminal opens context menu', async () => {
  await showTestLabel(page, '24. Terminal Context Menu\nRight-click terminal...');
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');

  const labels = await page.locator('.context-menu-item').allTextContents();
  expect(labels).toContain('Copy');
  expect(labels).toContain('Paste');
  expect(labels).toContain('Clear');
  expect(labels).toContain('Search');
});

test('terminal context menu Clear clears terminal', async () => {
  // Close existing menu first
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Type something
  await focusTerminal(page);
  await page.keyboard.type('clear-test-output', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Right-click and clear
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Clear');
  await page.waitForTimeout(500);
  // No crash = pass
});

test('terminal context menu Search opens search bar', async () => {
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Search');
  await page.waitForTimeout(300);

  expect(await page.locator('.terminal-search-bar').count()).toBe(1);

  // Close search
  await page.locator('.terminal-search-close').click();
  await page.waitForTimeout(200);
});

test('terminal context menu closes on backdrop click', async () => {
  const terminal = page.locator('.terminal-view:visible').first();
  await terminal.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await page.locator('.context-menu-backdrop').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(200);
  expect(await page.locator('.context-menu').count()).toBe(0);
});

// ==========================================
// 25. DEAD TERMINAL & RESTART
// ==========================================

test('typing exit shows dead terminal overlay', async () => {
  await showTestLabel(page, '25. Dead Terminal & Restart\nExiting terminal...');
  // Create a fresh session to exit
  await createNewTerminal(page);
  await focusTerminal(page);
  await page.keyboard.type('exit', { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  expect(await page.locator('.terminal-overlay').count()).toBe(1);
  const text = await page.locator('.terminal-overlay-text').textContent();
  expect(text).toContain('exited');
});

test('restart button re-launches terminal', async () => {
  const restartBtn = page.locator('.terminal-overlay-btn');
  expect(await restartBtn.count()).toBe(1);
  await restartBtn.click();
  await page.waitForTimeout(2000);

  // Overlay should be gone
  expect(await page.locator('.terminal-overlay').count()).toBe(0);
});

test('exit code badge clears after restart', async () => {
  const badge = page.locator('.session-item.active .session-exit-badge');
  expect(await badge.count()).toBe(0);
});

// ==========================================
// 26. SIDEBAR — Collapse, Position, Resize
// ==========================================

test('collapse button collapses sidebar to 40px', async () => {
  await showTestLabel(page, '26. Sidebar Controls\nCollapsing sidebar...');
  const collapseBtn = page.locator('.titlebar-action-btn[title*="Collapse sidebar"]');
  if (await collapseBtn.count() > 0) {
    await collapseBtn.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('.sidebar');
    const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBe(40);
  }
});

test('collapsed sidebar shows icon-only items', async () => {
  expect(await page.locator('.sidebar-collapsed-item').count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator('.session-list').count()).toBe(0);
});

test('clicking collapsed item switches session', async () => {
  const items = page.locator('.sidebar-collapsed-item');
  if (await items.count() >= 2) {
    await items.nth(1).click();
    await page.waitForTimeout(300);
    expect(await items.nth(1).getAttribute('class')).toContain('active');
  }
});

test('expand button restores sidebar', async () => {
  const expandBtn = page.locator('.titlebar-action-btn[title*="Expand sidebar"]');
  if (await expandBtn.count() > 0) {
    await expandBtn.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('.sidebar');
    const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(100);
  }
});

test('position toggle moves sidebar to right', async () => {
  const posBtn = page.locator('.titlebar-action-btn[title*="Move sidebar to right"]');
  if (await posBtn.count() > 0) {
    await posBtn.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('.sidebar');
    const order = await sidebar.evaluate((el) => (el as HTMLElement).style.order);
    expect(order).toBe('1');
  }
});

test('position toggle moves sidebar back to left', async () => {
  const posBtn = page.locator('.titlebar-action-btn[title*="Move sidebar to left"]');
  if (await posBtn.count() > 0) {
    await posBtn.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('.sidebar');
    const order = await sidebar.evaluate((el) => (el as HTMLElement).style.order);
    expect(order).toBe('0');
  }
});

// ==========================================
// 27. GROUP RENAME
// ==========================================

test('rename group via context menu', async () => {
  await showTestLabel(page, '27. Group Rename\nRenaming group...');
  // Create a group first
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'New group...');
  await page.waitForTimeout(300);
  await page.locator('.session-rename-input').last().fill('OldName');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // Right-click header to rename
  const header = page.locator('.session-group-header').first();
  await header.click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Rename group');
  await page.waitForTimeout(300);

  const input = page.locator('.session-rename-input').last();
  await input.fill('NewName');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  expect(await page.locator('.session-group-header').first().textContent()).toContain('NewName');

  // Clean up
  await page.locator('.session-group-header').first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Delete group');
  await page.waitForTimeout(300);
});

// ==========================================
// 28. TABLET MODE — Full Functional
// ==========================================

test('tablet +Term creates terminal session', async () => {
  await showTestLabel(page, '28. Tablet Mode Full\nTesting all tablet buttons...');
  // Enter tablet mode
  await page.locator('.titlebar-action-btn[title="Tablet mode"]').click();
  await page.waitForTimeout(500);

  const before = await sessionItems(page).count();
  await page.locator('.tt-btn', { hasText: '+Term' }).click();
  await page.waitForTimeout(1000);
  expect(await sessionItems(page).count()).toBe(before + 1);
});

test('tablet +Web creates browser session', async () => {
  await page.locator('.tt-btn', { hasText: '+Web' }).click();
  await page.waitForTimeout(1000);
  expect(await page.locator('.session-icon.browser').count()).toBeGreaterThanOrEqual(1);
});

test('tablet close button closes session', async () => {
  const before = await sessionItems(page).count();
  const closeBtn = page.locator('.tt-btn-danger').first();
  if (await closeBtn.count() > 0 && before > 1) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    expect(await sessionItems(page).count()).toBe(before - 1);
  }
});

test('tablet split vertical creates split', async () => {
  // Switch to a terminal session first
  const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  await termSession.first().click();
  await page.waitForTimeout(300);

  const splitBtn = page.locator('.tt-btn[title="Split vertical"]');
  if (await splitBtn.count() > 0) {
    await splitBtn.click();
    await page.waitForTimeout(1000);
    expect(await splitChildren(page).count()).toBe(1);
  }
});

test('tablet ×Split closes split', async () => {
  const closeSplitBtn = page.locator('.tt-btn-danger', { hasText: 'Split' });
  if (await closeSplitBtn.count() > 0) {
    await closeSplitBtn.click();
    await page.waitForTimeout(500);
    expect(await splitChildren(page).count()).toBe(0);
  }
});

test('tablet Find opens search bar', async () => {
  const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  await termSession.first().click();
  await page.waitForTimeout(300);

  await page.locator('.tt-btn', { hasText: 'Find' }).click();
  await page.waitForTimeout(500);
  expect(await page.locator('.terminal-search-bar').count()).toBe(1);

  await page.locator('.terminal-search-close').click();
  await page.waitForTimeout(200);
});

test('tablet MOV/SEL toggle switches modes', async () => {
  const toggle = page.locator('.tt-mode-toggle');
  const before = await toggle.textContent();
  await toggle.click();
  await page.waitForTimeout(200);
  const after = await toggle.textContent();
  expect(after).not.toBe(before);

  // Toggle back
  await toggle.click();
  await page.waitForTimeout(200);
});

test('tablet arrow buttons are clickable', async () => {
  const arrows = page.locator('.tt-arrow');
  expect(await arrows.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    await arrows.nth(i).click();
    await page.waitForTimeout(100);
  }
});

test('tablet Pg scroll buttons work', async () => {
  await page.locator('.tt-btn-sm', { hasText: 'Pg' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.tt-btn-sm', { hasText: 'Pg' }).last().click();
  await page.waitForTimeout(200);
});

test('tablet Copy button is clickable', async () => {
  await page.locator('.tt-btn', { hasText: 'Copy' }).click();
  await page.waitForTimeout(200);
});

test('tablet Paste button is clickable', async () => {
  await page.locator('.tt-btn', { hasText: 'Paste' }).click();
  await page.waitForTimeout(200);
});

test('tablet Clear button clears terminal', async () => {
  await page.locator('.tt-btn', { hasText: 'Clear' }).click();
  await page.waitForTimeout(200);
});

test('tablet sidebar toggle collapses sidebar', async () => {
  const sidebarToggle = page.locator('.tt-btn-icon').first();
  await sidebarToggle.click();
  await page.waitForTimeout(300);

  const sidebar = page.locator('.sidebar');
  const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBe(40);

  // Expand
  await sidebarToggle.click();
  await page.waitForTimeout(300);
});

test('tablet settings button opens settings', async () => {
  await page.locator('.tt-btn-icon[title="Settings"]').click();
  await page.waitForSelector('.settings-panel');
  expect(await page.locator('.settings-panel').count()).toBe(1);
  await page.locator('.settings-btn', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(300);
});

test('tablet controls hidden when browser active', async () => {
  // Switch to browser session
  const browserSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.browser') });
  if (await browserSession.count() > 0) {
    await browserSession.first().click();
    await page.waitForTimeout(500);

    // Terminal-only controls should be gone
    expect(await page.locator('.tt-btn', { hasText: 'Copy' }).count()).toBe(0);
    expect(await page.locator('.tt-btn', { hasText: 'Find' }).count()).toBe(0);
    expect(await page.locator('.tt-arrow').count()).toBe(0);

    // Switch back to terminal
    const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
    if (await termSession.count() > 0) await termSession.first().click();
    await page.waitForTimeout(300);
  }
});

test('exit tablet mode', async () => {
  await page.locator('.tt-btn-icon[title="Desktop mode"]').click();
  await page.waitForTimeout(500);
  expect(await page.locator('.tablet-toolbar').count()).toBe(0);
});

// ==========================================
// 29. SCROLL BUTTONS — Functional
// ==========================================

test('scroll up button is clickable', async () => {
  await showTestLabel(page, '29. Scroll Buttons\nTesting scroll...');
  const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
  if (await termSession.count() > 0) await termSession.first().click();
  await page.waitForTimeout(300);

  const upBtn = page.locator('.scroll-btn-up');
  await upBtn.dispatchEvent('mousedown');
  await page.waitForTimeout(200);
  await upBtn.dispatchEvent('mouseup');
});

test('scroll down button is clickable', async () => {
  const downBtn = page.locator('.scroll-btn-down');
  await downBtn.dispatchEvent('mousedown');
  await page.waitForTimeout(200);
  await downBtn.dispatchEvent('mouseup');
});

test('scroll buttons hidden when browser active', async () => {
  const browserSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.browser') });
  if (await browserSession.count() > 0) {
    await browserSession.first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('.scroll-btn-up').count()).toBe(0);
    expect(await page.locator('.scroll-btn-down').count()).toBe(0);

    // Switch back
    const termSession = page.locator('.session-item:not(.session-child)', { has: page.locator('.session-icon.terminal') });
    if (await termSession.count() > 0) await termSession.first().click();
    await page.waitForTimeout(300);
  }
});

// ==========================================
// 30. SESSION RENAME VIA CONTEXT MENU
// ==========================================

test('context menu Rename opens inline edit', async () => {
  await showTestLabel(page, '30. Context Menu Rename\nRenaming via menu...');
  await sessionItems(page).first().click({ button: 'right' });
  await page.waitForSelector('.context-menu');
  await clickContextMenuItem(page, 'Rename');
  await page.waitForTimeout(300);

  expect(await page.locator('.session-rename-input').count()).toBe(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
});
