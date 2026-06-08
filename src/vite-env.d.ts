/// <reference types="vite/client" />

interface ElectronAPI {
  loadData: () => Promise<any>
  saveData: (data: any) => Promise<void>
  openPath: (filePath: string) => Promise<void>
  getFileIcon: (filePath: string) => Promise<string | null>
  resolveShortcut: (filePath: string) => Promise<{ target: string; description?: string } | null>
  onVisibilityChange: (callback: (visible: boolean) => void) => void
  closeBoxWindow: (collectionId: string) => Promise<void>
  toggleExpand: (collectionId: string, expanded: boolean) => Promise<void>
  scanDesktop: () => Promise<Array<{ name: string; path: string }>>
  showOpenDialog: (options: any) => Promise<string[] | null>
}

interface Window {
  electronAPI: ElectronAPI
  __initCollections?: any[]
  __boxPosition?: { x: number; y: number }
}
