/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-17 10:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-17 10:00
 * @FilePath: src/main/boundsStore.ts
 * @Description: 主进程侧窗口位置/尺寸持久化，独立于渲染层 localStorage，保证启动时即可恢复
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 窗口几何信息 */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

// 持久化文件存放于用户数据目录，避免污染项目根目录，且多用户互不干扰
const BOUNDS_PATH = join(app.getPath('userData'), 'window-bounds.json')

/**
 * 读取上次保存的窗口位置与尺寸。
 * 业务背景：首次启动或文件损坏时返回 null，交由 createWindow 使用默认尺寸并由系统决定位置。
 */
export function loadWindowBounds(): WindowBounds | null {
  try {
    if (!existsSync(BOUNDS_PATH)) return null
    const data = JSON.parse(readFileSync(BOUNDS_PATH, 'utf-8')) as Partial<WindowBounds>
    if (
      typeof data.x === 'number' &&
      typeof data.y === 'number' &&
      typeof data.width === 'number' &&
      typeof data.height === 'number'
    ) {
      return { x: data.x, y: data.y, width: data.width, height: data.height }
    }
    return null
  } catch (error) {
    console.warn('[bounds] 读取失败，使用默认窗口位置:', error)
    return null
  }
}

/**
 * 写入窗口位置与尺寸。
 * 因为 macOS 最小化后 bounds 会变为 { x:0, y:0 }，保存前由调用方确保仅记录有效状态，
 * 此处仅做基础磁盘写入与目录兜底创建。
 */
export function saveWindowBounds(bounds: WindowBounds): void {
  try {
    const dir = join(app.getPath('userData'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(BOUNDS_PATH, JSON.stringify(bounds), 'utf-8')
  } catch (error) {
    // 磁盘异常时静默降级，不阻断阅读体验
    console.error('[bounds] 写入失败:', error)
  }
}
