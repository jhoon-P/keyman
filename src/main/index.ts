import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { logger } from './log/logger'
import { initDb, closeDb } from './db/repository'
import { closeBrowser, isBrowserReady, installBrowserAsync } from './core/browser'
import { registerCollectHandlers } from './ipc/collectHandlers'
import { registerDataHandlers } from './ipc/dataHandlers'
import { registerExportHandlers } from './ipc/exportHandlers'
import { ADAPTER_CATALOG } from './core/sources/registry'

const isDev = process.env['NODE_ENV'] === 'development'

function setupAutoUpdater(win: BrowserWindow) {
  if (isDev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update:progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update:ready')
  })

  autoUpdater.on('error', (err) => {
    logger.info(`Auto-updater error: ${err.message}`)
  })

  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates())

  // 앱 시작 30초 후 자동 체크 (안정화 후 실행)
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 30_000)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '키맨 발굴 — 회사 연락처 수집',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    logger.info('Window shown')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 창 제어 IPC 핸들러
  ipcMain.on('win:minimize', () => win.minimize())
  ipcMain.on('win:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('win:close', () => win.close())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(isDev ? process.execPath : 'com.key.app')
  }

  // 최초 실행 시 Chromium 자동 설치 — 로딩 창을 띄우고 비동기로 설치
  if (!isBrowserReady()) {
    const installWin = new BrowserWindow({
      width: 400,
      height: 160,
      frame: false,
      resizable: false,
      center: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: { sandbox: true }
    })

    const html = `<!DOCTYPE html><html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
display:flex;flex-direction:column;align-items:center;justify-content:center;
height:100vh;background:#1e1e2e;color:#cdd6f4;gap:14px;">
<div style="font-size:15px;font-weight:600;">Chromium 설치 중...</div>
<div style="font-size:12px;color:#a6adc8;">최초 1회 설치입니다 · 약 1~3분 소요</div>
<div style="width:300px;height:6px;background:#313244;border-radius:3px;overflow:hidden;margin-top:4px;">
  <div id="bar" style="height:100%;width:0%;background:#89b4fa;border-radius:3px;transition:width 0.4s ease;"></div>
</div>
<div id="pct" style="font-size:13px;color:#89b4fa;font-weight:600;">0%</div>
</body></html>`

    installWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    installWin.once('ready-to-show', () => installWin.show())

    try {
      await installBrowserAsync((percent) => {
        if (!installWin.isDestroyed()) {
          installWin.webContents.executeJavaScript(
            `document.getElementById('bar').style.width='${percent}%';document.getElementById('pct').textContent='${percent}%';`
          ).catch(() => undefined)
        }
      })
    } catch (err) {
      installWin.close()
      dialog.showErrorBox(
        'Chromium 설치 실패',
        `브라우저 설치에 실패했습니다.\n인터넷 연결을 확인 후 앱을 다시 실행해주세요.\n\n${String(err)}`
      )
      app.quit()
      return
    }

    installWin.close()
  }

  try {
    await initDb()
    logger.info('DB initialized')
  } catch (err) {
    dialog.showErrorBox('초기화 실패', `DB를 불러오지 못했습니다.\n\n${String(err)}`)
    app.quit()
    return
  }

  ipcMain.handle('app:adapterCatalog', () => ADAPTER_CATALOG)
  ipcMain.handle('app:logDir', () => logger.getLogDir())
  ipcMain.handle('app:version', () => app.getVersion())

  const win = createWindow()
  registerCollectHandlers(win)
  registerDataHandlers()
  registerExportHandlers()
  setupAutoUpdater(win)

  logger.info('App ready')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting')
  closeDb()
  closeBrowser().catch(() => undefined)
  if (process.platform !== 'darwin') app.quit()
})
