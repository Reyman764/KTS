const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  rawMaterials: {
    getAll: () => ipcRenderer.invoke('raw-materials:getAll'),
    create: (data) => ipcRenderer.invoke('raw-materials:create', data),
    update: (data) => ipcRenderer.invoke('raw-materials:update', data),
    getDeleteImpact: (id) => ipcRenderer.invoke('raw-materials:getDeleteImpact', id),
    delete: (id) => ipcRenderer.invoke('raw-materials:delete', id),
  },
  materialCodes: {
    getByRawMaterial: (rawMaterialId) =>
      ipcRenderer.invoke('material-codes:getByRawMaterial', rawMaterialId),
    create: (data) => ipcRenderer.invoke('material-codes:create', data),
    update: (data) => ipcRenderer.invoke('material-codes:update', data),
    getDeleteImpact: (id) => ipcRenderer.invoke('material-codes:getDeleteImpact', id),
    delete: (id) => ipcRenderer.invoke('material-codes:delete', id),
  },
  transactions: {
    getByEntity: (params) => ipcRenderer.invoke('transactions:getByEntity', params),
    create: (data) => ipcRenderer.invoke('transactions:create', data),
    update: (data) => ipcRenderer.invoke('transactions:update', data),
    delete: (data) => ipcRenderer.invoke('transactions:delete', data),
  },
  reports: {
    query: (params) => ipcRenderer.invoke('reports:query', params),
    queryAll: (params) => ipcRenderer.invoke('reports:queryAll', params),
  },
});