const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  openFolder: (folderPath) => ipcRenderer.invoke("open-folder", folderPath),
  restartServer: () => ipcRenderer.invoke("restart-server"),
  restartApp: () => ipcRenderer.invoke("restart-app"),
  stopApp: () => ipcRenderer.invoke("stop-app"),
});
