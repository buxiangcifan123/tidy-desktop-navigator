import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BOX_WIDTH = 220
const BOX_HEIGHT = 160
const EXPANDED_WIDTH = 360
const EXPANDED_HEIGHT = 520

export function createBoxWindow(
  collectionId: string,
  collectionData: any, // the full collection object
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
    // Normal focus behavior — windows come forward only when clicked
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
