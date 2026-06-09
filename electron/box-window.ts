import { BrowserWindow, screen } from 'electron'
import path from 'path'

const BOX_WIDTH = 220
const BOX_HEIGHT = 160
const EXPANDED_WIDTH = 360
const EXPANDED_HEIGHT = 520

let preloadPath: string = ''

export function setPreloadPath(p: string) {
  preloadPath = p
}

export function createBoxWindow(
  collectionId: string,
  collectionData: any,
  x: number,
  y: number
): BrowserWindow {
  // Clamp position to screen bounds so windows never appear off-screen
  const { workArea } = screen.getPrimaryDisplay()
  const clampedX = Math.max(0, Math.min(x, workArea.width - BOX_WIDTH))
  const clampedY = Math.max(0, Math.min(y, workArea.height - BOX_HEIGHT))

  const win = new BrowserWindow({
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    x: clampedX,
    y: clampedY,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const baseUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`
  const separator = baseUrl.includes('?') ? '&' : '?'
  // Pass only lightweight metadata via URL (items come from IPC load-data)
  const meta = { id: collectionData.id, name: collectionData.name }
  const dataJson = encodeURIComponent(JSON.stringify(meta))
  win.loadURL(`${baseUrl}${separator}box=${collectionId}&init=${dataJson}`)

  win.setSkipTaskbar(true)

  return win
}

export function updateBoxPosition(win: BrowserWindow, x: number, y: number) {
  if (!win.isDestroyed()) {
    const { workArea } = screen.getPrimaryDisplay()
    const bounds = win.getBounds()
    const clampedX = Math.max(0, Math.min(x, workArea.width - bounds.width))
    const clampedY = Math.max(0, Math.min(y, workArea.height - bounds.height))
    win.setPosition(clampedX, clampedY)
  }
}

export function resizeBoxWindow(win: BrowserWindow, expanded: boolean) {
  if (!win.isDestroyed()) {
    if (expanded) {
      win.setSize(EXPANDED_WIDTH, EXPANDED_HEIGHT)
      win.center()
    } else {
      win.setSize(BOX_WIDTH, BOX_HEIGHT)
    }
  }
}
