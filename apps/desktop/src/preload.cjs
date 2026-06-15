const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("binderyDesktop", {
  pickWorkspaceFolder: () => ipcRenderer.invoke("bindery:pick-workspace-folder"),
  platform: process.platform
});
