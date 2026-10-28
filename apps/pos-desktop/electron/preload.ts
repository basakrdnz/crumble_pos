import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNEL } from '../src/api/contract';

contextBridge.exposeInMainWorld('crumble', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke(IPC_CHANNEL, method, args),
});
