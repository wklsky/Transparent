/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/preload/index.ts
 * @Description: 通过 contextBridge 暴露最小化 IPC API，渲染进程不直接接触 Node/Electron 能力
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OpenFileResult, WindowState } from '@shared/types'

/**
 * 渲染进程可用的阅读器 API。
 * 事件类方法返回取消订阅函数，便于组件 onUnmounted 清理，避免监听器泄漏。
 */
const readerApi = {
  openFile: (): Promise<OpenFileResult> => ipcRenderer.invoke('reader:open-file'),
  openFilePath: (filePath: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke('reader:open-path', filePath),
  togglePassthrough: (): Promise<boolean> => ipcRenderer.invoke('reader:toggle-passthrough'),
  toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('reader:toggle-always-on-top'),
  setWindowOpacity: (opacity: number): void => ipcRenderer.send('reader:set-window-opacity', opacity),
  /** 退出整个应用（等价于全局快捷键 Ctrl+Shift+Q） */
  quitApp: (): void => ipcRenderer.send('reader:quit'),
  /** 通知主进程按增量缩放窗口（无边框窗口自绘手柄用） */
  resizeWindow: (deltaW: number, deltaH: number): void => ipcRenderer.send('reader:resize', deltaW, deltaH),
  getWindowState: (): Promise<WindowState> => ipcRenderer.invoke('reader:get-window-state'),
  /** 拖放文件时获取真实磁盘路径（Electron 30+ 移除了 File.path） */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  onWindowStateChange: (cb: (state: WindowState) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: WindowState): void => cb(state)
    ipcRenderer.on('window:state-changed', listener)
    return () => ipcRenderer.removeListener('window:state-changed', listener)
  },
  onOpenFileRequest: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('menu:open-file', listener)
    return () => ipcRenderer.removeListener('menu:open-file', listener)
  },
  onBgAlphaDelta: (cb: (delta: number) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, delta: number): void => cb(delta)
    ipcRenderer.on('menu:bg-alpha-delta', listener)
    return () => ipcRenderer.removeListener('menu:bg-alpha-delta', listener)
  }
}

contextBridge.exposeInMainWorld('readerAPI', readerApi)

export type ReaderApi = typeof readerApi
