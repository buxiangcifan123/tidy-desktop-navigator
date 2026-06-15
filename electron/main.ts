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
import { createBoxWindow, updateBoxPosition, resizeBoxWindow, setPreloadPath } from './box-window'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let tray: Tray | null = null
let updateTrayMenu: (() => void) | null = null

// Map of collectionId -> BrowserWindow
const boxWindows = new Map<string, BrowserWindow>()

const dataDir = path.join(app.getPath('userData'), 'data')
const dataFile = path.join(dataDir, 'collections.json')
const configFile = path.join(dataDir, 'config.json')

// Startup folder .lnk — same approach as Ollama. More reliable than
// registry Run key because shortcuts carry working directory + args.
const startupDir = path.join(
  app.getPath('appData'),
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
)
const startupFile = path.join(startupDir, 'tidy-start.vbs')

// ── Config helpers ──────────────────────────────────────────

interface AppConfig {
  firstLaunchDone?: boolean
  autoStartEnabled?: boolean
}

function loadConfig(): AppConfig {
  ensureDataDir()
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function saveConfig(config: AppConfig) {
  ensureDataDir()
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
}

// Place a .vbs script in the Startup folder (like n8n does).
// .vbs avoids .lnk path resolution issues during early boot.
//
// Written as UTF-16LE (the native Windows Unicode encoding) so Chinese
// characters in paths are preserved correctly. VBScript reads UTF-16LE
// files without issue.
function setAutoStart(enabled: boolean) {
  try {
    if (enabled) {
      const isDev = !app.isPackaged
      const projectRoot = path.resolve(__dirname, '..')
      const electronExe = isDev ? process.execPath : process.execPath

      const vbsLines = [
        `Set WshShell = CreateObject("WScript.Shell")`,
        `Set env = WshShell.Environment("PROCESS")`,
        `env("NODE_OPTIONS") = ""`,
      ]
      if (isDev) {
        vbsLines.push(
          `' Launch electron with project path (dev mode)`,
          `WshShell.Run """${electronExe.replace(/\\/g, '\\\\')}"" ""${projectRoot.replace(/\\/g, '\\\\')}""", 0, False`,
        )
      } else {
        vbsLines.push(
          `WshShell.Run """${electronExe.replace(/\\/g, '\\\\')}""", 0, False`,
        )
      }
      const vbsContent = '﻿' + vbsLines.join('\r\n') + '\r\n'

      // UTF-16LE with BOM — VBScript's native Unicode format
      fs.writeFileSync(startupFile, vbsContent, 'utf16le')
      console.log('[auto-start] VBS created:', startupFile)
    } else {
      if (fs.existsSync(startupFile)) {
        fs.unlinkSync(startupFile)
        console.log('[auto-start] VBS removed:', startupFile)
      }
    }
  } catch (err) {
    console.error('[auto-start] Failed:', err)
  }
}

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
        // Don't delete from disk on window close — the user may have
        // accidentally closed it or the window may have been destroyed
        // by external factors (fullscreen games, display changes, etc.)
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
      ...cols.map((col: any) => {
        const win = boxWindows.get(col.id)
        const isVisible = win && !win.isDestroyed() && win.isVisible()
        return {
          label: `${isVisible ? '👁' : '📦'} ${col.name} (${col.items.length}项)`,
          submenu: [
            {
              label: isVisible ? '聚焦窗口' : '显示窗口',
              click: () => {
                if (win && !win.isDestroyed()) {
                  if (win.isVisible()) {
                    win.focus()
                  } else {
                    win.show()
                    win.focus()
                  }
                } else {
                  const allCols = loadCollections()
                  const found = allCols.find((c: any) => c.id === col.id)
                  if (found) {
                    const newWin = createBoxWindow(found.id, found, found.x, found.y)
                    boxWindows.set(found.id, newWin)
                  }
                }
              },
            },
            { type: 'separator' },
            {
              label: '🗑 删除收纳框',
              click: () => {
                boxWindows.delete(col.id)
                if (win && !win.isDestroyed()) {
                  win.close()
                }
                const filtered = loadCollections().filter((c: any) => c.id !== col.id)
                saveCollections(filtered)
                updateMenu()
              },
            },
          ],
        }
      }),
      { type: 'separator' },
      {
        label: `开机自启: ${fs.existsSync(startupFile) ? '✅ 已开启' : '☐ 已关闭'}`,
        click: () => {
          const current = fs.existsSync(startupFile)
          const next = !current
          setAutoStart(next)
          // Persist preference so it survives registry loss
          const cfg = loadConfig()
          cfg.autoStartEnabled = next
          saveConfig(cfg)
          updateMenu()
        },
      },
      {
        label: '退出 Tidy',
        click: () => app.quit(),
      },
    ])
    tray?.setContextMenu(contextMenu)
  }

  updateTrayMenu = updateMenu
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
    // 16x16 solid blue PNG (verified valid)
  const newCol = {
    id,
    name: '新收纳框',
    x: 500 + cols.length * 30,
    y: 300 + cols.length * 30,
    items: [],
  }
  cols.push(newCol)
  saveCollections(cols)
  syncBoxWindows(cols)
  updateTrayMenu?.()
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
    updateTrayMenu?.()
  }
}

// ── IPC Handlers ──────────────────────────────────────────

ipcMain.handle('load-data', async () => {
  return { collections: loadCollections() }
})

ipcMain.handle('save-data', async (_event, data: any) => {
  // Merge: update collection items from renderer, but KEEP positions from disk
  // (positions are tracked by main process via 'moved' event — the renderer's
  // x/y may be stale and would cause the window to snap back on every save)
  const existing = loadCollections()
  const incomingMap = new Map(data.collections.map((c: any) => [c.id, c]))
  const merged = existing.map((c: any) => {
    const incoming = incomingMap.get(c.id)
    if (!incoming) return c
    // Preserve position tracked by main process
    return { ...incoming, x: c.x, y: c.y }
  })
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
  console.log('[open-path] Trying to open:', filePath)
  try {
    const error = await shell.openPath(filePath)
    if (error) {
      console.error('[open-path] shell.openPath returned error:', error)
      // Fallback: try shell.openExternal for protocol URLs (steam://, taptap://, etc.)
      if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(filePath)) {
        console.log('[open-path] Retrying with shell.openExternal...')
        await shell.openExternal(filePath)
        console.log('[open-path] shell.openExternal succeeded')
      } else {
        console.error('[open-path] Not a protocol URL, no fallback available')
      }
    } else {
      console.log('[open-path] Successfully opened:', filePath)
    }
  } catch (err) {
    console.error('[open-path] Exception thrown:', err)
  }
})

ipcMain.handle('get-file-icon', async (_event, filePath: string) => {
  try {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.ico') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.bmp')) {
      const img = nativeImage.createFromPath(filePath)
      if (!img.isEmpty()) {
        return `data:image/png;base64,${img.toPNG().toString('base64')}`
      }
    }
    // For .lnk shortcuts, resolve target and get icon from the actual .exe
    let iconPath = filePath
    if (lower.endsWith('.lnk')) {
      try {
        const detail = shell.readShortcutLink(filePath)
        if (detail.target && fs.existsSync(detail.target)) {
          iconPath = detail.target
        }
      } catch { /* use filePath */ }
    }
    const icon = await app.getFileIcon(iconPath, { size: 'large' })
    return `data:image/png;base64,${icon.toPNG().toString('base64')}`
  } catch {
    return null
  }
})

ipcMain.handle('resolve-shortcut', async (_event, filePath: string) => {
  try {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.lnk')) {
      const detail = shell.readShortcutLink(filePath)
      return {
        target: detail.target,
        description: detail.description || '',
        icon: detail.icon || '',
        iconIndex: detail.iconIndex ?? 0,
      }
    }
    if (lower.endsWith('.url')) {
      // Parse .url (Internet Shortcut) file — Steam/TapTap games use this format.
      // Steam .url files are UTF-8, TapTap .url files are UTF-16 LE (BOM 0xFF 0xFE).
      const raw = fs.readFileSync(filePath)
      let content: string
      if (raw[0] === 0xff && raw[1] === 0xfe) {
        content = raw.toString('utf16le')
      } else {
        content = raw.toString('utf-8')
      }
      const urlMatch = content.match(/^URL=(.+)$/m)
      const iconFileMatch = content.match(/^IconFile=(.+)$/m)
      const iconIndexMatch = content.match(/^IconIndex=(\d+)$/m)
      const iconPath = iconFileMatch ? iconFileMatch[1].trim() : ''
      return {
        target: urlMatch ? urlMatch[1].trim() : '',
        description: '',
        icon: iconPath,
        iconIndex: iconIndexMatch ? parseInt(iconIndexMatch[1], 10) : 0,
      }
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

// Box window actions
ipcMain.handle('hide-box-window', (_event, collectionId: string) => {
  const win = boxWindows.get(collectionId)
  if (win && !win.isDestroyed()) {
    win.hide()
  }
})

ipcMain.handle('show-box-window', (_event, collectionId: string) => {
  const win = boxWindows.get(collectionId)
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  } else {
    // Window was destroyed — recreate from disk data
    const cols = loadCollections()
    const col = cols.find((c: any) => c.id === collectionId)
    if (col) {
      const newWin = createBoxWindow(collectionId, col, col.x, col.y)
      boxWindows.set(collectionId, newWin)
    }
  }
})

ipcMain.handle('close-box-window', (_event, collectionId: string) => {
  const win = boxWindows.get(collectionId)
  if (win && !win.isDestroyed()) {
    win.close()
    boxWindows.delete(collectionId)
  }
  // Permanently delete from disk
  const cols = loadCollections().filter((c: any) => c.id !== collectionId)
  saveCollections(cols)
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
  // Auto-start with Windows
  // Persist user preference in config and enforce it on EVERY launch,
  // not just the first one. Otherwise any external change (Windows update,
  // antivirus, Task Manager disable, etc.) permanently kills auto-start.
  const config = loadConfig()
  if (!config.firstLaunchDone) {
    // First launch: default auto-start to true
    config.firstLaunchDone = true
    config.autoStartEnabled = true
    saveConfig(config)
  }
  // Always apply the saved preference — repairs registry if it was lost
  const shouldAutoStart = config.autoStartEnabled !== false // default true
  setAutoStart(shouldAutoStart)

  setPreloadPath(path.join(__dirname, 'preload.js'))

  // Must sync boxes BEFORE creating tray so the menu sees existing windows
  const cols = loadCollections()
  syncBoxWindows(cols)
  createTray()
})

app.on('window-all-closed', () => {
  // Don't quit - keep running in tray
})

app.on('before-quit', () => {
  for (const win of boxWindows.values()) {
    if (!win.isDestroyed()) win.close()
  }
})
