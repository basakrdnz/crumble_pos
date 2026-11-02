import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNEL, NAVIGATE_CHANNEL } from '../src/api/contract';

contextBridge.exposeInMainWorld('crumble', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke(IPC_CHANNEL, method, args),
  onNavigate: (listener: (screen: string) => void) => {
    const handler = (_event: unknown, screen: string) => listener(screen);
    ipcRenderer.on(NAVIGATE_CHANNEL, handler);
    return () => void ipcRenderer.removeListener(NAVIGATE_CHANNEL, handler);
  },
});
