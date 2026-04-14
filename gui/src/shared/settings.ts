import type { ITheme } from '@xterm/xterm';

// ===== Theme Definitions =====

export const themes: Record<string, { terminal: ITheme; ui: { bg: string; sidebar: string; border: string; accent: string; text: string; textMuted: string; textDim: string } }> = {
  neon: {
    terminal: {
      background: '#0b0e1a',
      foreground: '#c0dff0',
      cursor: '#00e5ff',
      cursorAccent: '#0b0e1a',
      selectionBackground: '#1a3550',
      selectionForeground: '#e0f0ff',
      black: '#0b0e1a',
      red: '#ff5370',
      green: '#00e676',
      yellow: '#ffab40',
      blue: '#40c4ff',
      magenta: '#ea80fc',
      cyan: '#00e5ff',
      white: '#c0dff0',
      brightBlack: '#3a4560',
      brightRed: '#ff8a80',
      brightGreen: '#69f0ae',
      brightYellow: '#ffd180',
      brightBlue: '#80d8ff',
      brightMagenta: '#ea80fc',
      brightCyan: '#84ffff',
      brightWhite: '#e8f4ff',
    },
    ui: {
      bg: '#070a14',
      sidebar: '#080c18',
      border: '#0e1525',
      accent: '#00e5ff',
      text: '#80d8ff',
      textMuted: '#4a7090',
      textDim: '#2a4060',
    },
  },
  'tokyo-night': {
    terminal: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      selectionForeground: '#c0caf5',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
    ui: {
      bg: '#16161e',
      sidebar: '#1a1b26',
      border: '#292e42',
      accent: '#7aa2f7',
      text: '#a9b1d6',
      textMuted: '#565f89',
      textDim: '#3b4261',
    },
  },
  catppuccin: {
    terminal: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      cursorAccent: '#1e1e2e',
      selectionBackground: '#45475a',
      selectionForeground: '#cdd6f4',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
    ui: {
      bg: '#181825',
      sidebar: '#1e1e2e',
      border: '#313244',
      accent: '#89b4fa',
      text: '#cdd6f4',
      textMuted: '#6c7086',
      textDim: '#45475a',
    },
  },
  dracula: {
    terminal: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      selectionForeground: '#f8f8f2',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
    ui: {
      bg: '#21222c',
      sidebar: '#282a36',
      border: '#44475a',
      accent: '#bd93f9',
      text: '#f8f8f2',
      textMuted: '#6272a4',
      textDim: '#44475a',
    },
  },
};

// ===== Settings Schema =====

export interface ShellProfile {
  name: string;
  path: string;
  args: string[];
}

export interface Settings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: 'bar' | 'block' | 'underline';
  cursorBlink: boolean;
  scrollback: number;
  opacity: number;
  shellProfiles: ShellProfile[];
  defaultShell: string;
}

export const defaultSettings: Settings = {
  theme: 'neon',
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  lineHeight: 1.15,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  opacity: 1.0,
  shellProfiles: [
    { name: 'Git Bash', path: 'C:/Program Files/Git/bin/bash.exe', args: ['--login', '-i'] },
    { name: 'PowerShell 7', path: 'C:/Program Files/PowerShell/7/pwsh.exe', args: [] },
    { name: 'PowerShell', path: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', args: [] },
  ],
  defaultShell: 'Git Bash',
};
