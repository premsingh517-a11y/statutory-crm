const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crm', {
  get: () => ipcRenderer.invoke('cfg:get'),
  save: cfg => ipcRenderer.invoke('cfg:save', cfg),
  chooseFolder: () => ipcRenderer.invoke('dl:choose'),
});
