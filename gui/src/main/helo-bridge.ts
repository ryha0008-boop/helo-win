import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export interface Blueprint {
  name: string;
  runtime: string;
  provider: string;
  model: string;
  claude_md: string | null;
}

export interface HeloStatus {
  config_path: string;
  blueprints: number;
  api_keys: Record<string, boolean>;
}

async function runHelo(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileP('helo', args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

export function registerHeloHandlers() {
  ipcMain.handle('helo:list', async (): Promise<Blueprint[]> => {
    const { stdout } = await runHelo(['list', '--json']);
    return JSON.parse(stdout);
  });

  ipcMain.handle('helo:status', async (): Promise<HeloStatus> => {
    const { stdout } = await runHelo(['status', '--json']);
    return JSON.parse(stdout);
  });

  ipcMain.handle('helo:add', async (
    _event,
    { name, runtime, provider, model, claudeMd }: {
      name: string; runtime: string; provider: string; model: string; claudeMd?: string;
    }
  ) => {
    const args = ['add', name, '--runtime', runtime, '--provider', provider, '--model', model];
    if (claudeMd) args.push('--claude-md', claudeMd);
    const { stdout, stderr } = await runHelo(args);
    return { stdout, stderr };
  });

  ipcMain.handle('helo:remove', async (_event, name: string) => {
    const { stdout, stderr } = await runHelo(['remove', name]);
    return { stdout, stderr };
  });

  ipcMain.handle('helo:defaults-show', async (_event, runtime: string): Promise<string> => {
    const { stdout } = await runHelo(['defaults', 'show', runtime]);
    return stdout;
  });
}
