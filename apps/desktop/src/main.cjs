const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");

const DEFAULT_WORKBENCH_URL = process.env.BINDERY_DESKTOP_URL || "http://127.0.0.1:3000";

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    title: "BINDERY BOX Desktop",
    backgroundColor: "#070b16",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(DEFAULT_WORKBENCH_URL);
  return win;
}

ipcMain.handle("bindery:pick-workspace-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose BINDERY workspace folder",
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return { path: result.filePaths[0] };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
