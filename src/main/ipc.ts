/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/main/ipc.ts
 * @Description: 主进程 IPC 注册：打开/解析文件、鼠标穿透、置顶、窗口不透明度、状态广播
 */

import { basename, extname } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { parseTxtFile } from './parsers/txtParser'
import { parseEpubFile } from './parsers/epubParser'
import { setAlwaysOnTopRef, setPassthroughRef } from './index'
import type { OpenFileResult, WindowState } from '@shared/types'

let targetWindow: BrowserWindow | null = null
let passthrough = false
let alwaysOnTop = true

/** 按扩展名分发到对应解析器，失败时返回用户可读错误信息 */
async function parseBookByExt(filePath: string): Promise<OpenFileResult> {
  try {
    const ext = extname(filePath).toLowerCase()
    const book =
      ext === '.txt'
        ? await parseTxtFile(filePath)
        : ext === '.epub'
          ? await parseEpubFile(filePath)
          : null
    if (!book) {
      return { ok: false, book: null, error: `不支持的文件类型：${ext || '未知'}（仅支持 .txt / .epub）` }
    }
    return { ok: true, book }
  } catch (error) {
    console.error('[ipc] 解析失败:', error)
    return {
      ok: false,
      book: null,
      error: error instanceof Error ? error.message : '解析文件时发生未知错误'
    }
  }
}

/** 切换鼠标穿透：forward 模式保留渲染层 pointer-events:auto 元素（控制面板）的可点击性 */
export function setPassthrough(enabled: boolean): void {
  passthrough = enabled
  targetWindow?.setIgnoreMouseEvents(enabled, { forward: true })
  targetWindow?.webContents.send('window:state-changed', { passthrough, alwaysOnTop } satisfies WindowState)
}

export function setAlwaysOnTop(enabled: boolean): void {
  alwaysOnTop = enabled
  targetWindow?.setAlwaysOnTop(enabled, 'screen-saver')
  targetWindow?.webContents.send('window:state-changed', { passthrough, alwaysOnTop } satisfies WindowState)
}

/** 向渲染进程同步一次当前窗口状态（初始化与状态变化时调用） */
export function broadcastWindowState(): void {
  targetWindow?.webContents.send('window:state-changed', { passthrough, alwaysOnTop } satisfies WindowState)
}

/** 注册全部 IPC 通道（窗口创建后调用一次） */
export function registerIpcHandlers(win: BrowserWindow): void {
  targetWindow = win
  // 让 index.ts 中的全局快捷键能读取到最新状态
  setPassthroughRef(() => passthrough)
  setAlwaysOnTopRef(() => alwaysOnTop)

  ipcMain.handle('reader:open-file', async (): Promise<OpenFileResult> => {
    const result = await dialog.showOpenDialog(win, {
      title: '打开电子书',
      properties: ['openFile'],
      filters: [
        { name: '电子书文件', extensions: ['txt', 'epub'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, book: null }
    }
    return parseBookByExt(result.filePaths[0])
  })

  ipcMain.handle('reader:open-path', (_event, filePath: unknown): Promise<OpenFileResult> => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return Promise.resolve({ ok: false, book: null, error: '无效的文件路径' })
    }
    return parseBookByExt(filePath)
  })

  ipcMain.handle('reader:toggle-passthrough', (): boolean => {
    setPassthrough(!passthrough)
    return passthrough
  })

  ipcMain.handle('reader:toggle-always-on-top', (): boolean => {
    setAlwaysOnTop(!alwaysOnTop)
    return alwaysOnTop
  })

  ipcMain.on('reader:set-window-opacity', (_event, value: unknown) => {
    const opacity = Number(value)
    if (Number.isFinite(opacity)) {
      win.setOpacity(Math.min(1, Math.max(0.2, opacity)))
    }
  })

  ipcMain.handle('reader:get-window-state', (): WindowState => ({ passthrough, alwaysOnTop }))

  ipcMain.handle('reader:get-file-title', (_event, filePath: unknown): string => {
    if (typeof filePath !== 'string') return ''
    return basename(filePath)
  })

  // 退出应用：先关闭鼠标穿透，确保 app.quit 触发的 beforeunload 能正常持久化阅读进度
  ipcMain.on('reader:quit', () => {
    if (passthrough) setPassthrough(false)
    app.quit()
  })

  // 无边框窗口无法从系统边缘缩放，由渲染层 resize 手柄实时通知主进程改变尺寸。
  // deltaW/deltaH 为相对上一次鼠标移动的增量，主进程在现有 bounds 上累加，
  // 并受窗口 minWidth/minHeight 约束（BrowserWindow 构造时已设）。
  ipcMain.on('reader:resize', (_event, deltaW: unknown, deltaH: unknown) => {
    const dw = Number(deltaW)
    const dh = Number(deltaH)
    if (!Number.isFinite(dw) || !Number.isFinite(dh)) return
    const bounds = win.getBounds()
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: Math.max(win.getMinimumSize()[0], bounds.width + dw),
      height: Math.max(win.getMinimumSize()[1], bounds.height + dh)
    })
  })
}
