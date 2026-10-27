import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('crumble', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
