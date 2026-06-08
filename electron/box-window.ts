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
  const win = new BrowserWindow({
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    x,
    y,
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
  // Pass collection data via URL to avoid any timing issues
  const dataJson = encodeURIComponent(JSON.stringify(collectionData))
  win.loadURL(`${baseUrl}${separator}box=${collectionId}&init=${dataJson}`)

  win.setSkipTaskbar(true)
  win.webContents.openDevTools({ mode: 'detach' })

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
