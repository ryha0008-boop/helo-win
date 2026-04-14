export interface Session {
  id: string;
  name: string;
  isActive: boolean;
}

export type IpcChannels =
  | 'pty:create'
  | 'pty:write'
  | 'pty:resize'
  | 'pty:destroy'
  | 'pty:data'
  | 'pty:exit';

export interface PtyCreateRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyResizeRequest {
  id: string;
  cols: number;
  rows: number;
}

export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
}
