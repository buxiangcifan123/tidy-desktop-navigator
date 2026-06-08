// Electron preload MUST be CommonJS — use require() not import
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Data persistence
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),

  // File operations
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
  resolveShortcut: (filePath) => ipcRenderer.invoke('resolve-shortcut', filePath),

  // Window visibility
  onVisibilityChange: (callback) => {
    ipcRenderer.on('visibility-change', (_event, visible) => callback(visible))
  },

  // Desktop scan
  scanDesktop: () => ipcRenderer.invoke('scan-desktop'),

  // Box window operations
  closeBoxWindow: (collectionId) => ipcRenderer.invoke('close-box-window', collectionId),
  toggleExpand: (collectionId, expanded) => ipcRenderer.invoke('box-toggle-expand', collectionId, expanded),

  // Dialog
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
})
