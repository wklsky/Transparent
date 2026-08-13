/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/main/index.ts
 * @Description: Electron 主进程入口：创建透明无边框置顶窗口，注册全局快捷键与应用生命周期
 */

import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, shell } from 'electron'
import { registerIpcHandlers, setPassthrough, setAlwaysOnTop, broadcastWindowState } from './ipc'

let mainWindow: BrowserWindow | null = null

/** 获取当前主窗口，未创建时返回 null */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * 创建阅读器主窗口。
 * 关键：transparent + frame:false + backgroundColor 全透明 + hasShadow:false，
 * 才能让渲染层背景完全透明时"只显示文字"；Windows 下关闭阴影可减少透明窗口毛边。
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 360,
    minHeight: 240,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    title: '透明阅读器',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win
  registerIpcHandlers(win)

  win.once('ready-to-show', () => win.show())

  // 外部链接一律交给系统浏览器，防止在透明窗口内导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** 注册全局快捷键（无窗口时直接忽略） */
function registerShortcuts(): void {
  const win = (): BrowserWindow | null => mainWindow
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    win()?.webContents.send('menu:open-file')
  })
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    setPassthrough(!getPassthroughRef())
  })
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    setAlwaysOnTop(!getAlwaysOnTopRef())
  })
  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    win()?.webContents.send('menu:bg-alpha-delta', 10)
  })
  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    win()?.webContents.send('menu:bg-alpha-delta', -10)
  })
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit()
  })
}

/** 为快捷键服务提供的最小状态读取接口（由 ipc.ts 填充） */
type PassthroughGetter = () => boolean
type AlwaysOnTopGetter = () => boolean
let getPassthroughRef: PassthroughGetter = () => false
let getAlwaysOnTopRef: AlwaysOnTopGetter = () => false
export function setPassthroughRef(fn: PassthroughGetter): void {
  getPassthroughRef = fn
}
export function setAlwaysOnTopRef(fn: AlwaysOnTopGetter): void {
  getAlwaysOnTopRef = fn
}

// 禁用 Chromium 后台联网：避免 dev 环境下 Chromium 向 Google 域名发起连通性探测/
// 崩溃上报等后台请求，在受限网络中表现为 ssl_client_socket handshake failed 噪声日志。
// 必须在任何窗口创建前设置，否则不生效。
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-features', 'Crashpad')
// 关闭渲染进程内不必要的远程能力（拼写检查词库下载等）
app.commandLine.appendSwitch('disable-spell-checking')

// 单实例锁：重复启动时聚焦已有窗口而非新开
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    registerShortcuts()
    broadcastWindowState()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
