const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todo', {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  signIn: () => ipcRenderer.invoke('sign-in'),
  signOut: () => ipcRenderer.invoke('sign-out'),
  sync: () => ipcRenderer.invoke('sync'),
  toggleDone: (id) => ipcRenderer.invoke('toggle-done', id),
  addTask: (task) => ipcRenderer.invoke('add-task', task),
  removeTask: (id) => ipcRenderer.invoke('remove-task', id),
  clearDone: () => ipcRenderer.invoke('clear-done'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  quit: () => ipcRenderer.invoke('quit'),
});
