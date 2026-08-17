/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/main/index.ts
 * @Description: Electron 主进程入口：创建透明无边框置顶窗口，注册全局快捷键与应用生命周期
 */

import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, screen, shell } from 'electron'
import { registerIpcHandlers, setPassthrough, setAlwaysOnTop, broadcastWindowState } from './ipc'
import { loadWindowBounds, saveWindowBounds } from './boundsStore'

let mainWindow: BrowserWindow | null = null

/** 获取当前主窗口，未创建时返回 null */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

// 业务背景：窗口拖动/缩放是高频事件，直接落盘写 JSON 会产生大量 IO。
// 用定时器合并最近一次变更，最多每 500ms 写一次，兼顾实时性与性能。
let boundsSaveTimer: NodeJS.Timeout | null = null
function scheduleSaveBounds(win: BrowserWindow): void {
  if (boundsSaveTimer) return
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null
    // macOS 最小化/还原过程中 bounds 会瞬变为 {0,0}，此时跳过保存以免覆盖正常位置
    if (win.isMinimized() || !win.isVisible()) return
    const b = win.getBounds()
    if (b.x === 0 && b.y === 0 && b.width === 0) return
    saveWindowBounds(b)
  }, 500)
}

/**
 * 创建阅读器主窗口。
 * 关键：transparent + frame:false + backgroundColor 全透明 + hasShadow:false，
 * 才能让渲染层背景完全透明时"只显示文字"；Windows 下关闭阴影可减少透明窗口毛边。
 */
function createWindow(): void {
  // 恢复上次关闭前的窗口位置与尺寸；首次启动返回 null 则沿用默认尺寸并由系统定位
  const saved = loadWindowBounds()
  const win = new BrowserWindow({
    ...(saved ? { x: saved.x, y: saved.y } : {}),
    width: saved?.width ?? 900,
    height: saved?.height ?? 640,
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
  // 业务背景：外接显示器拔掉或分辨率变更后，上次保存的坐标可能落到所有显示器之外，
  // 导致窗口不可见。恢复后做可用性兜底，越界则重新居中到主显示器。
  if (saved && !screen.getDisplayNearestPoint({ x: saved.x, y: saved.y })) {
    win.center()
  }
  mainWindow = win
  registerIpcHandlers(win)

  // 位置/尺寸变化即记录，下次启动恢复
  win.on('move', () => scheduleSaveBounds(win))
  win.on('resize', () => scheduleSaveBounds(win))

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
