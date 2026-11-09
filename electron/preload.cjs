const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectVaultFolder: () => ipcRenderer.invoke('vault:select-folder'),
  writeVaultFile: (params) => ipcRenderer.invoke('vault:write-file', params),
  deleteVaultFile: (params) => ipcRenderer.invoke('vault:delete-file', params),
  getSyncServerInfo: () => ipcRenderer.invoke('sync:get-server-info'),
  setSyncPin: (pin) => ipcRenderer.invoke('sync:set-pin', pin),
  onIncomingSync: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sync:incoming-request', handler);
    return () => ipcRenderer.removeListener('sync:incoming-request', handler);
  },
  onGetSyncCounts: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sync:get-counts-request', handler);
    return () => ipcRenderer.removeListener('sync:get-counts-request', handler);
  },
  sendSyncResponse: (id, accepted, result, reason) => {
    ipcRenderer.send('sync:response', { id, accepted, result, reason });
  },
  triggerMobileSync: (params) => ipcRenderer.invoke('sync:trigger-mobile-sync', params),
  getConnectedDevices: () => ipcRenderer.invoke('sync:get-connected-devices'),
});
