import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  Tray,
  Menu,
  nativeImage,
} from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createBoxWindow, updateBoxPosition, resizeBoxWindow } from './box-window'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let tray: Tray | null = null

// Map of collectionId -> BrowserWindow
const boxWindows = new Map<string, BrowserWindow>()

const dataDir = path.join(app.getPath('userData'), 'data')
const dataFile = path.join(dataDir, 'collections.json')

// ── Data helpers ──────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

function loadCollections(): any[] {
  ensureDataDir()
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf-8')).collections || []
    }
  } catch { /* ignore */ }
  return []
}

function saveCollections(collections: any[]) {
  ensureDataDir()
  fs.writeFileSync(dataFile, JSON.stringify({ collections }, null, 2), 'utf-8')
}

// ── Box window management ─────────────────────────────────

function findByWindow(win: BrowserWindow): string | undefined {
  for (const [id, w] of boxWindows) {
    if (w === win) return id
  }
  return undefined
}

function syncBoxWindows(collections: any[]) {
  const existingIds = new Set(boxWindows.keys())
  const newIds = new Set(collections.map((c: any) => c.id))

  // Close removed boxes
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      const win = boxWindows.get(id)!
      if (!win.isDestroyed()) win.close()
      boxWindows.delete(id)
    }
  }

  // Create or update boxes
  for (const col of collections) {
    const existing = boxWindows.get(col.id)
    if (existing && !existing.isDestroyed()) {
      updateBoxPosition(existing, col.x, col.y)
    } else {
      const win = createBoxWindow(col.id, col, col.x, col.y)
      boxWindows.set(col.id, win)

      // Save position when window is dragged
      win.on('moved', () => {
        const cid = findByWindow(win)
        if (!cid) return
        const [wx, wy] = win.getPosition()
        const cols = loadCollections()
        const col = cols.find((c: any) => c.id === cid)
        if (col) {
          col.x = wx
          col.y = wy
          saveCollections(cols)
        }
      })

      win.on('closed', () => {
        boxWindows.delete(col.id)
        // Also remove from disk so it doesn't come back
        const cols = loadCollections().filter((c: any) => c.id !== col.id)
        saveCollections(cols)
      })
    }
  }
}

// ── Tray ───────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.png')
  let icon = nativeImage.createEmpty()
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Tidy - 桌面导航器')

  const updateMenu = () => {
    const cols = loadCollections()
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '+ 新建收纳框',
        click: () => {
          addNewCollection()
        },
      },
      {
        label: '扫描桌面快捷方式',
        click: () => {
          scanAndImport()
        },
      },
      { type: 'separator' },
      ...cols.map((col: any) => ({
        label: `📁 ${col.name} (${col.items.length}项)`,
        enabled: false,
      })),
      { type: 'separator' },
      {
        label: '退出 Tidy',
        click: () => app.quit(),
      },
    ])
    tray?.setContextMenu(contextMenu)
  }

  updateMenu()
  tray.on('right-click', updateMenu)

  tray.on('double-click', () => {
    // Toggle all box windows visibility
    const allHidden = [...boxWindows.values()].every(
      (w) => !w.isDestroyed() && !w.isVisible()
    )
    for (const win of boxWindows.values()) {
      if (!win.isDestroyed()) {
        allHidden ? win.show() : win.hide()
      }
    }
  })
}

let lastAddTime = 0
function addNewCollection() {
  // Debounce: prevent duplicate calls within 500ms
  const now = Date.now()
  if (now - lastAddTime < 500) return
  lastAddTime = now

  const cols = loadCollections()
  const id = Math.random().toString(36).slice(2, 11)
    // Known-good red 1x1 PNG data URL for testing
  const testIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4y2P4z8BQz0BKYGKgohEAAP/3Af8AAC38SURBVHjaY/z//z8DPQATFQ0OAAAAAElFTkSuQmCC'
  const newCol = {
    id,
    name: '新收纳框',
    x: 500 + cols.length * 30,
    y: 300 + cols.length * 30,
    items: [
      { id: 'test1', name: '测试应用', path: 'C:\\Windows\\System32\\notepad.exe', type: 'file', icon: testIcon },
      { id: 'test2', name: '测试文件夹', path: 'C:\\Windows', type: 'folder', icon: testIcon },
    ],
  }
  cols.push(newCol)
  saveCollections(cols)
  syncBoxWindows(cols)
}

async function scanAndImport() {
  const desktopPath = app.getPath('desktop')
  const items: any[] = []
  try {
    const files = fs.readdirSync(desktopPath)
    for (const file of files) {
      if (file.toLowerCase().endsWith('.lnk')) {
        const fullPath = path.join(desktopPath, file)
        try {
          const detail = shell.readShortcutLink(fullPath)
          let icon: string | null = null
          try {
            const nativeIcon = await app.getFileIcon(detail.target || fullPath, { size: 'large' })
            icon = `data:image/png;base64,${nativeIcon.toPNG().toString('base64')}`
          } catch { /* ignore */ }

          items.push({
            id: Math.random().toString(36).slice(2, 11),
            name: path.basename(file, '.lnk'),
            path: detail.target || fullPath,
            type: 'shortcut',
            icon,
          })
        } catch {
          items.push({
            id: Math.random().toString(36).slice(2, 11),
            name: file,
            path: fullPath,
            type: 'shortcut',
          })
        }
      }
    }
  } catch { /* ignore */ }

  if (items.length > 0) {
    const cols = loadCollections()
    const id = Math.random().toString(36).slice(2, 11)
    cols.push({
      id,
      name: '桌面应用',
      x: 300,
      y: 200,
      items,
    })
    saveCollections(cols)
    syncBoxWindows(cols)
  }
}

// ── IPC Handlers ──────────────────────────────────────────

ipcMain.handle('load-data', async () => {
  const logFile = path.join(app.getPath('userData'), 'ipc-debug.log')
  const cols = loadCollections()
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] load-data called, found ${cols.length} collections\n`)
  return { collections: cols }
})

ipcMain.handle('save-data', async (_event, data: any) => {
  // Debug: also log to file
  const logFile = path.join(app.getPath('userData'), 'ipc-debug.log')
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] save-data called, collections: ${data.collections?.length || 0}\n`)

  // Merge with existing data: update matching collections, add new ones
  const existing = loadCollections()
  const incomingMap = new Map(data.collections.map((c: any) => [c.id, c]))
  const merged = existing.map((c: any) => incomingMap.get(c.id) || c)
  // Add collections not in existing
  for (const col of data.collections) {
    if (!existing.find((c: any) => c.id === col.id)) {
      merged.push(col)
    }
  }
  saveCollections(merged)
  syncBoxWindows(merged)
})

ipcMain.handle('open-path', async (_event, filePath: string) => {
  try {
    await shell.openPath(filePath)
  } catch { /* ignore */ }
})

ipcMain.handle('get-file-icon', async (_event, filePath: string) => {
  const logFile = path.join(app.getPath('userData'), 'icon-debug.log')
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Request: ${filePath}\n`)
    const icon = await app.getFileIcon(filePath, { size: 'large' })
    const png = icon.toPNG()
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Success: ${png.length} bytes\n`)
    return `data:image/png;base64,${png.toString('base64')}`
  } catch (e: any) {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${e.message}\n`)
    return null
  }
})

ipcMain.handle('resolve-shortcut', async (_event, filePath: string) => {
  try {
    if (filePath.toLowerCase().endsWith('.lnk')) {
      const detail = shell.readShortcutLink(filePath)
      return { target: detail.target, description: detail.description || '' }
    }
  } catch { /* ignore */ }
  return null
})

ipcMain.handle('scan-desktop', async () => {
  const desktopPath = app.getPath('desktop')
  const results: Array<{ name: string; path: string }> = []
  try {
    for (const file of fs.readdirSync(desktopPath)) {
      if (file.toLowerCase().endsWith('.lnk')) {
        const fullPath = path.join(desktopPath, file)
        try {
          const detail = shell.readShortcutLink(fullPath)
          results.push({ name: path.basename(file, '.lnk'), path: detail.target || fullPath })
        } catch {
          results.push({ name: file, path: fullPath })
        }
      }
    }
  } catch { /* ignore */ }
  return results
})

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
  })
  return result.canceled ? null : result.filePaths
})

// Debug ping
ipcMain.handle('ping', async () => {
  const logFile = path.join(app.getPath('userData'), 'ping-debug.log')
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] PING received\n`)
  return 'pong'
})

// Box window actions
ipcMain.handle('close-box-window', (_event, collectionId: string) => {
  const win = boxWindows.get(collectionId)
  if (win && !win.isDestroyed()) {
    win.close()
    boxWindows.delete(collectionId)
  }
})

ipcMain.handle('box-drag-end', (_event, collectionId: string, x: number, y: number) => {
  const cols = loadCollections()
  const col = cols.find((c: any) => c.id === collectionId)
  if (col) {
    col.x = x
    col.y = y
    saveCollections(cols)
  }
})

ipcMain.handle('box-toggle-expand', (_event, collectionId: string, expanded: boolean) => {
  const win = boxWindows.get(collectionId)
  if (win) {
    resizeBoxWindow(win, expanded)
  }
})

// ── App lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  createTray()
  // Restore saved collection boxes
  const cols = loadCollections()
  syncBoxWindows(cols)
})

app.on('window-all-closed', () => {
  // Don't quit - keep running in tray
})

app.on('before-quit', () => {
  for (const win of boxWindows.values()) {
    if (!win.isDestroyed()) win.close()
  }
})
