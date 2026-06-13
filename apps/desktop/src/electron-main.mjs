import { app, BrowserWindow, shell } from "electron";

const missionControlUrl = process.env.BINDERY_WEB_URL ?? "http://localhost:4310";

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 860, title: "BINDERY BOX" });
  win.loadURL(missionControlUrl);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
