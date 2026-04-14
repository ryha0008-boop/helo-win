import '@testing-library/jest-dom/vitest';

// Mock window.terminal API
const mockTerminalAPI = {
  createPty: vi.fn(),
  writePty: vi.fn(),
  resizePty: vi.fn(),
  destroyPty: vi.fn(),
  addDataListener: vi.fn(),
  removeDataListener: vi.fn(),
  addExitListener: vi.fn(),
  removeExitListener: vi.fn(),
  addReadyListener: vi.fn(),
  removeReadyListener: vi.fn(),
  addErrorListener: vi.fn(),
  removeErrorListener: vi.fn(),
  listShells: vi.fn().mockResolvedValue(['Git Bash', 'PowerShell']),
  openExternal: vi.fn(),
  onForceQuit: vi.fn(),
  loadSettings: vi.fn().mockResolvedValue(null),
  saveSettings: vi.fn(),
  setOpacity: vi.fn(),
  listDaemonSessions: vi.fn().mockResolvedValue([]),
  attachSession: vi.fn(),
  onDaemonSessions: vi.fn(),
  saveBrowserSessions: vi.fn(),
  loadBrowserSessions: vi.fn().mockResolvedValue(null),
  saveSessionNames: vi.fn(),
  loadSessionNames: vi.fn().mockResolvedValue(null),
  setZoom: vi.fn(),
  windowMinimize: vi.fn(),
  windowMaximize: vi.fn(),
  windowClose: vi.fn(),
};

Object.defineProperty(window, 'terminal', {
  value: mockTerminalAPI,
  writable: true,
});

// Mock crypto.randomUUID
let uuidCounter = 0;
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: () => `test-uuid-${++uuidCounter}`,
  writable: true,
});

// Reset mocks and counters between tests
beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any;

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
