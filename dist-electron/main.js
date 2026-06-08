import { screen, BrowserWindow, app, ipcMain, shell, dialog, nativeImage, Tray, Menu } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __filename$2 = fileURLToPath(import.meta.url);
const __dirname$2 = path.dirname(__filename$2);
const BOX_WIDTH = 220;
const BOX_HEIGHT = 160;
const EXPANDED_WIDTH = 360;
const EXPANDED_HEIGHT = 520;
function createBoxWindow(collectionId, collectionData, x, y) {
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
      preload: path.join(__dirname$2, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const baseUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname$2, "../dist/index.html")}`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const dataJson = encodeURIComponent(JSON.stringify(collectionData));
  win.loadURL(`${baseUrl}${separator}box=${collectionId}&init=${dataJson}`);
  win.setSkipTaskbar(true);
  win.webContents.openDevTools({ mode: "detach" });
  return win;
}
function updateBoxPosition(win, x, y) {
  if (!win.isDestroyed()) {
    const { workArea } = screen.getPrimaryDisplay();
    const bounds = win.getBounds();
    const clampedX = Math.max(0, Math.min(x, workArea.width - bounds.width));
    const clampedY = Math.max(0, Math.min(y, workArea.height - bounds.height));
    win.setPosition(clampedX, clampedY);
  }
}
function resizeBoxWindow(win, expanded) {
  if (!win.isDestroyed()) {
    if (expanded) {
      win.setSize(EXPANDED_WIDTH, EXPANDED_HEIGHT);
      win.center();
    } else {
      win.setSize(BOX_WIDTH, BOX_HEIGHT);
    }
  }
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let tray = null;
const boxWindows = /* @__PURE__ */ new Map();
const dataDir = path.join(app.getPath("userData"), "data");
const dataFile = path.join(dataDir, "collections.json");
function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}
function loadCollections() {
  ensureDataDir();
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, "utf-8")).collections || [];
    }
  } catch {
  }
  return [];
}
function saveCollections(collections) {
  ensureDataDir();
  fs.writeFileSync(dataFile, JSON.stringify({ collections }, null, 2), "utf-8");
}
function findByWindow(win) {
  for (const [id, w] of boxWindows) {
    if (w === win) return id;
  }
  return void 0;
}
function syncBoxWindows(collections) {
  const existingIds = new Set(boxWindows.keys());
  const newIds = new Set(collections.map((c) => c.id));
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      const win = boxWindows.get(id);
      if (!win.isDestroyed()) win.close();
      boxWindows.delete(id);
    }
  }
  for (const col of collections) {
    const existing = boxWindows.get(col.id);
    if (existing && !existing.isDestroyed()) {
      updateBoxPosition(existing, col.x, col.y);
    } else {
      const win = createBoxWindow(col.id, col, col.x, col.y);
      boxWindows.set(col.id, win);
      win.on("moved", () => {
        const cid = findByWindow(win);
        if (!cid) return;
        const [wx, wy] = win.getPosition();
        const cols = loadCollections();
        const col2 = cols.find((c) => c.id === cid);
        if (col2) {
          col2.x = wx;
          col2.y = wy;
          saveCollections(cols);
        }
      });
      win.on("closed", () => {
        boxWindows.delete(col.id);
        const cols = loadCollections().filter((c) => c.id !== col.id);
        saveCollections(cols);
      });
    }
  }
}
function createTray() {
  const iconPath = path.join(__dirname$1, "../assets/icon.png");
  let icon = nativeImage.createEmpty();
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Tidy - 桌面导航器");
  const updateMenu = () => {
    const cols = loadCollections();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "+ 新建收纳框",
        click: () => {
          addNewCollection();
        }
      },
      {
        label: "扫描桌面快捷方式",
        click: () => {
          scanAndImport();
        }
      },
      { type: "separator" },
      ...cols.map((col) => ({
        label: `📁 ${col.name} (${col.items.length}项)`,
        enabled: false
      })),
      { type: "separator" },
      {
        label: "退出 Tidy",
        click: () => app.quit()
      }
    ]);
    tray == null ? void 0 : tray.setContextMenu(contextMenu);
  };
  updateMenu();
  tray.on("right-click", updateMenu);
  tray.on("double-click", () => {
    const allHidden = [...boxWindows.values()].every(
      (w) => !w.isDestroyed() && !w.isVisible()
    );
    for (const win of boxWindows.values()) {
      if (!win.isDestroyed()) {
        allHidden ? win.show() : win.hide();
      }
    }
  });
}
let lastAddTime = 0;
function addNewCollection() {
  const now = Date.now();
  if (now - lastAddTime < 500) return;
  lastAddTime = now;
  const cols = loadCollections();
  const id = Math.random().toString(36).slice(2, 11);
  const testIcon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVQ4y2P4z8BQz0BKYGKgohEAAP/3Af8AAC38SURBVHjaY/z//z8DPQATFQ0OAAAAAElFTkSuQmCC";
  const newCol = {
    id,
    name: "新收纳框",
    x: 500 + cols.length * 30,
    y: 300 + cols.length * 30,
    items: [
      { id: "test1", name: "测试应用", path: "C:\\Windows\\System32\\notepad.exe", type: "file", icon: testIcon },
      { id: "test2", name: "测试文件夹", path: "C:\\Windows", type: "folder", icon: testIcon }
    ]
  };
  cols.push(newCol);
  saveCollections(cols);
  syncBoxWindows(cols);
}
async function scanAndImport() {
  const desktopPath = app.getPath("desktop");
  const items = [];
  try {
    const files = fs.readdirSync(desktopPath);
    for (const file of files) {
      if (file.toLowerCase().endsWith(".lnk")) {
        const fullPath = path.join(desktopPath, file);
        try {
          const detail = shell.readShortcutLink(fullPath);
          let icon = null;
          try {
            const nativeIcon = await app.getFileIcon(detail.target || fullPath, { size: "large" });
            icon = `data:image/png;base64,${nativeIcon.toPNG().toString("base64")}`;
          } catch {
          }
          items.push({
            id: Math.random().toString(36).slice(2, 11),
            name: path.basename(file, ".lnk"),
            path: detail.target || fullPath,
            type: "shortcut",
            icon
          });
        } catch {
          items.push({
            id: Math.random().toString(36).slice(2, 11),
            name: file,
            path: fullPath,
            type: "shortcut"
          });
        }
      }
    }
  } catch {
  }
  if (items.length > 0) {
    const cols = loadCollections();
    const id = Math.random().toString(36).slice(2, 11);
    cols.push({
      id,
      name: "桌面应用",
      x: 300,
      y: 200,
      items
    });
    saveCollections(cols);
    syncBoxWindows(cols);
  }
}
ipcMain.handle("load-data", async () => {
  const logFile = path.join(app.getPath("userData"), "ipc-debug.log");
  const cols = loadCollections();
  fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] load-data called, found ${cols.length} collections
`);
  return { collections: cols };
});
ipcMain.handle("save-data", async (_event, data) => {
  var _a;
  const logFile = path.join(app.getPath("userData"), "ipc-debug.log");
  fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] save-data called, collections: ${((_a = data.collections) == null ? void 0 : _a.length) || 0}
`);
  const existing = loadCollections();
  const incomingMap = new Map(data.collections.map((c) => [c.id, c]));
  const merged = existing.map((c) => incomingMap.get(c.id) || c);
  for (const col of data.collections) {
    if (!existing.find((c) => c.id === col.id)) {
      merged.push(col);
    }
  }
  saveCollections(merged);
  syncBoxWindows(merged);
});
ipcMain.handle("open-path", async (_event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch {
  }
});
ipcMain.handle("get-file-icon", async (_event, filePath) => {
  const logFile = path.join(app.getPath("userData"), "icon-debug.log");
  try {
    fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] Request: ${filePath}
`);
    const icon = await app.getFileIcon(filePath, { size: "large" });
    const png = icon.toPNG();
    fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] Success: ${png.length} bytes
`);
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (e) {
    fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] ERROR: ${e.message}
`);
    return null;
  }
});
ipcMain.handle("resolve-shortcut", async (_event, filePath) => {
  try {
    if (filePath.toLowerCase().endsWith(".lnk")) {
      const detail = shell.readShortcutLink(filePath);
      return { target: detail.target, description: detail.description || "" };
    }
  } catch {
  }
  return null;
});
ipcMain.handle("scan-desktop", async () => {
  const desktopPath = app.getPath("desktop");
  const results = [];
  try {
    for (const file of fs.readdirSync(desktopPath)) {
      if (file.toLowerCase().endsWith(".lnk")) {
        const fullPath = path.join(desktopPath, file);
        try {
          const detail = shell.readShortcutLink(fullPath);
          results.push({ name: path.basename(file, ".lnk"), path: detail.target || fullPath });
        } catch {
          results.push({ name: file, path: fullPath });
        }
      }
    }
  } catch {
  }
  return results;
});
ipcMain.handle("show-open-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory"]
  });
  return result.canceled ? null : result.filePaths;
});
ipcMain.handle("ping", async () => {
  const logFile = path.join(app.getPath("userData"), "ping-debug.log");
  fs.appendFileSync(logFile, `[${(/* @__PURE__ */ new Date()).toISOString()}] PING received
`);
  return "pong";
});
ipcMain.handle("close-box-window", (_event, collectionId) => {
  const win = boxWindows.get(collectionId);
  if (win && !win.isDestroyed()) {
    win.close();
    boxWindows.delete(collectionId);
  }
});
ipcMain.handle("box-drag-end", (_event, collectionId, x, y) => {
  const cols = loadCollections();
  const col = cols.find((c) => c.id === collectionId);
  if (col) {
    col.x = x;
    col.y = y;
    saveCollections(cols);
  }
});
ipcMain.handle("box-toggle-expand", (_event, collectionId, expanded) => {
  const win = boxWindows.get(collectionId);
  if (win) {
    resizeBoxWindow(win, expanded);
  }
});
app.whenReady().then(() => {
  createTray();
  const cols = loadCollections();
  syncBoxWindows(cols);
});
app.on("window-all-closed", () => {
});
app.on("before-quit", () => {
  for (const win of boxWindows.values()) {
    if (!win.isDestroyed()) win.close();
  }
});
