import fs from 'fs';
import path from 'path';

export interface ShellInfo {
  name: string;
  path: string;
  args: string[];
}

const CANDIDATES: ShellInfo[] = [
  { name: 'Git Bash', path: 'C:/Program Files/Git/bin/bash.exe', args: ['--login', '-i'] },
  { name: 'PowerShell 7', path: 'C:/Program Files/PowerShell/7/pwsh.exe', args: [] },
  { name: 'PowerShell', path: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', args: [] },
];

let detected: ShellInfo[] | null = null;

export function detectShells(): ShellInfo[] {
  if (detected) return detected;

  detected = CANDIDATES.filter((s) => {
    try {
      return fs.existsSync(s.path);
    } catch {
      return false;
    }
  });

  // Check for WSL — wsl.exe exists even without WSL installed,
  // so verify by checking if any distributions are registered
  try {
    const { execSync } = require('child_process');
    const result = execSync('wsl --list --quiet', { timeout: 3000, encoding: 'utf8' });
    if (result.trim().length > 0) {
      detected.push({ name: 'WSL', path: 'C:/Windows/System32/wsl.exe', args: [] });
    }
  } catch {
    // WSL not installed or no distributions
  }

  console.log(`[shell] Detected shells: ${detected.map((s) => s.name).join(', ')}`);
  return detected;
}

export function getDefaultShell(): ShellInfo {
  const shells = detectShells();
  if (shells.length === 0) {
    // Ultimate fallback
    return { name: 'Command Prompt', path: 'cmd.exe', args: [] };
  }
  return shells[0];
}

export function getShellByName(name: string): ShellInfo | undefined {
  return detectShells().find((s) => s.name === name);
}
