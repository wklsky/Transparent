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
import type { BookMeta, GetChapterResult, OpenFileResult, ParsedBook, WindowState } from '@shared/types'

let targetWindow: BrowserWindow | null = null
let passthrough = false
let alwaysOnTop = true

// 业务背景：按需加载场景下，主进程解析后会持有完整 ParsedBook（含全部正文），
// 但只把"标题列表"BookMeta 回传渲染进程；渲染进程切章时再通过 reader:get-chapter 取正文。
// 该引用随打开/关闭/退出而替换或清空，避免旧书对象常驻导致内存泄漏。
let currentBook: ParsedBook | null = null

/** 从完整书籍中剥离出仅含章节标题的元信息（不携带正文段落） */
function toBookMeta(book: ParsedBook): BookMeta {
  return {
    format: book.format,
    title: book.title,
    author: book.author,
    filePath: book.filePath,
    chapters: book.chapters.map((ch) => ({ title: ch.title }))
  }
}

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
    currentBook = book
    // 按需加载：仅回传元信息（章节标题列表），正文留待渲染进程按需索取
    return { ok: true, book: toBookMeta(book) }
  } catch (error) {
    console.error('[ipc] 解析失败:', error)
    return {
      ok: false,
      book: null,
      error: error instanceof Error ? error.message : '解析文件时发生未知错误'
    }
  }
}

/**
 * 切换鼠标穿透：开启后整窗忽略鼠标事件并转发给下层应用（forward 模式）。
 * 控制条可点击性不依赖 CSS，而由 setPassthroughHover 在鼠标悬停时临时关闭忽略来实现。
 */
export function setPassthrough(enabled: boolean): void {
  passthrough = enabled
  hoverHold = false
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

/**
 * 临时悬停穿透控制：forward 模式下整窗 setIgnoreMouseEvents(true) 会把控制条点击也转发给下层，
 * 导致按钮失效。因此鼠标进入控制条时关闭穿透（事件回到本窗），离开后若仍处于穿透模式则恢复。
 * 仅当 passthrough 开启时 hoverHold 才生效，避免影响正常模式。
 */
let hoverHold = false
export function setPassthroughHover(hovering: boolean): void {
  if (!passthrough) return
  if (hovering === hoverHold) return
  const win = targetWindow
  // 窗口未就绪时只记录意图，避免 hoverHold 与真实忽略状态错位导致后续悬停失灵
  if (!win) {
    hoverHold = hovering
    return
  }
  hoverHold = hovering
  // 悬停时关闭整窗忽略，离开且仍开启穿透时恢复忽略
  win.setIgnoreMouseEvents(hovering ? false : true, { forward: true })
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

  // 按需加载：渲染进程切章时按 index 取回该章正文，避免整本大书一次性跨进程克隆
  ipcMain.handle('reader:get-chapter', (_event, index: unknown): GetChapterResult => {
    const idx = Number(index)
    if (!currentBook || !Number.isInteger(idx) || idx < 0 || idx >= currentBook.chapters.length) {
      return { index: Number.isInteger(idx) ? idx : -1, paragraphs: [] }
    }
    return { index: idx, paragraphs: currentBook.chapters[idx].paragraphs }
  })

  ipcMain.handle('reader:get-file-title', (_event, filePath: unknown): string => {
    if (typeof filePath !== 'string') return ''
    return basename(filePath)
  })

  // 退出应用：先关闭鼠标穿透，确保 app.quit 触发的 beforeunload 能正常持久化阅读进度
  ipcMain.on('reader:quit', () => {
    if (passthrough) setPassthrough(false)
    // 释放主进程持有的整本书引用，避免退出前残留对象
    currentBook = null
    app.quit()
  })

  // 控制条悬停临时穿透开关：鼠标进入控制条时恢复本窗可交互，离开后归位穿透状态
  ipcMain.on('reader:passthrough-hover', (_event, hovering: unknown) => {
    setPassthroughHover(Boolean(hovering))
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
