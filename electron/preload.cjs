const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  rawMaterials: {
    getAll: () => ipcRenderer.invoke('raw-materials:getAll'),
    create: (data) => ipcRenderer.invoke('raw-materials:create', data),
  },
  materialCodes: {
    getByRawMaterial: (rawMaterialId) =>
      ipcRenderer.invoke('material-codes:getByRawMaterial', rawMaterialId),
    create: (data) => ipcRenderer.invoke('material-codes:create', data),
  },
  transactions: {
    getByEntity: (params) => ipcRenderer.invoke('transactions:getByEntity', params),
    create: (data) => ipcRenderer.invoke('transactions:create', data),
  },
  reports: {
    query: (params) => ipcRenderer.invoke('reports:query', params),
  },
});