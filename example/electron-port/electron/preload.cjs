// 키맨 발굴 — preload: 렌더러에서 안전하게 창 제어 호출
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("winControls", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
});
