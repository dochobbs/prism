'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('council', {
  invoke: (action, payload) => ipcRenderer.invoke('council', action, payload),
  onState: callback => { ipcRenderer.on('state', (_event, state) => callback(state)); },
});
