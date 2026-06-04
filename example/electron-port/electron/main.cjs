// 키맨 발굴 — Electron 메인 프로세스 (프레임리스 커스텀 타이틀바)
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    // 커스텀 타이틀바를 쓰므로 프레임 제거. (titlebar에 -webkit-app-region: drag 적용됨)
    frame: false,
    backgroundColor: "#f7f8f9",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    win.loadURL(startUrl); // 개발: vite dev 서버
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html")); // 프로덕션 빌드
  }

  // 커스텀 창 제어 버튼(.win-btn) 연결용 IPC
  ipcMain.on("win:minimize", () => win.minimize());
  ipcMain.on("win:maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on("win:close", () => win.close());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
