import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { logger } from './log/logger'
import { initDb, closeDb } from './db/repository'
import { closeBrowser } from './core/browser'
import { registerCollectHandlers } from './ipc/collectHandlers'
import { registerDataHandlers } from './ipc/dataHandlers'
import { registerExportHandlers } from './ipc/exportHandlers'
import { ADAPTER_CATALOG } from './core/sources/registry'

const isDev = process.env['NODE_ENV'] === 'development'

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

  const win = createWindow()
  registerCollectHandlers(win)
  registerDataHandlers()
  registerExportHandlers()

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
