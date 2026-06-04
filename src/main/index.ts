import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { logger } from './log/logger'
import { initDb, closeDb } from './db/repository'
import { closeBrowser, setupPlaywrightPath, isBrowserReady, installBrowserSync } from './core/browser'
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

  // Playwright 브라우저 경로를 userData로 고정 (관리자 권한 불필요)
  setupPlaywrightPath()

  // 최초 실행 시 Chromium 자동 설치
  if (!isBrowserReady()) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Chromium 설치',
      message: 'Chromium 브라우저 설치 (최초 1회)',
      detail: '수집에 필요한 Chromium 브라우저를 인터넷에서 내려받습니다.\n약 1~3분 소요됩니다. 완료 후 앱이 시작됩니다.',
      buttons: ['설치 시작']
    })
    try {
      installBrowserSync()
    } catch (err) {
      dialog.showErrorBox(
        'Chromium 설치 실패',
        `브라우저 설치에 실패했습니다.\n인터넷 연결을 확인 후 앱을 다시 실행해주세요.\n\n${String(err)}`
      )
      app.quit()
      return
    }
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
