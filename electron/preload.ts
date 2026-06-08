import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Data persistence
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data: any) => ipcRenderer.invoke('save-data', data),

  // File operations
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),
  getFileIcon: (filePath: string) => ipcRenderer.invoke('get-file-icon', filePath),
  resolveShortcut: (filePath: string) => ipcRenderer.invoke('resolve-shortcut', filePath),

  // Window visibility
  onVisibilityChange: (callback: (visible: boolean) => void) => {
    ipcRenderer.on('visibility-change', (_event, visible: boolean) => callback(visible))
  },

  // Desktop scan
  scanDesktop: () => ipcRenderer.invoke('scan-desktop'),

  // Debug
  ping: () => ipcRenderer.invoke('ping'),

  // Box window operations
  closeBoxWindow: (collectionId: string) =>
    ipcRenderer.invoke('close-box-window', collectionId),
  toggleExpand: (collectionId: string, expanded: boolean) =>
    ipcRenderer.invoke('box-toggle-expand', collectionId, expanded),

  // Dialog
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
})

export {}
