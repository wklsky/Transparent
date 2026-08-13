/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/composables/useSettings.ts
 * @Description: 阅读设置/进度/最近文件的 localStorage 持久化单例，settings 为响应式共享对象
 */

import { reactive, watch } from 'vue'
import type { BookProgress, PersistedData, ReaderSettings } from '@shared/types'

/** 持久化存储键，含前缀避免与页面其他存储冲突 */
const STORAGE_KEY = 'transparent-reader:persist'
/** 数据结构版本号，结构变更时用于触发旧数据迁移/丢弃 */
const STORAGE_VERSION = 1
/** 最近文件列表最大条数 */
const MAX_RECENT = 10

const DEFAULT_SETTINGS: ReaderSettings = {
  bgColor: '#111111',
  bgAlpha: 0,
  textColor: '#f2f2f2',
  fontSize: 20,
  lineHeight: 1.8,
  fontFamily: 'Microsoft YaHei',
  textShadow: false,
  windowOpacity: 1
}

/** 读取持久化数据；JSON 损坏或版本不符时静默降级为默认值 */
function loadPersisted(): PersistedData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedData
    return data.version === STORAGE_VERSION ? data : null
  } catch (error) {
    console.warn('[settings] 持久化数据读取失败，已使用默认值:', error)
    return null
  }
}

/** 全量写回持久化存储（设置/进度/最近文件同仓） */
function writePersisted(data: PersistedData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    // 存储写满或配额异常时仅降级为不持久化，不阻断阅读
    console.error('[settings] 持久化数据写入失败:', error)
  }
}

const base = loadPersisted() ?? { version: STORAGE_VERSION, settings: {}, progress: {}, recentFiles: [] as string[] }

/** 响应式设置对象：修改即自动持久化 */
const settings = reactive<ReaderSettings>({
  ...DEFAULT_SETTINGS,
  ...(base.settings as Partial<ReaderSettings>)
})

const progressMap: Record<string, BookProgress> = { ...(base.progress ?? {}) }
const recentFiles: string[] = [...(base.recentFiles ?? [])]

function persist(): void {
  writePersisted({
    version: STORAGE_VERSION,
    settings: { ...settings },
    progress: { ...progressMap },
    recentFiles: [...recentFiles]
  })
}

watch(settings, persist, { deep: true })

/** 保存某文件的阅读进度（章节 + 滚动比例） */
export function saveProgress(filePath: string, progress: BookProgress): void {
  progressMap[filePath] = progress
  persist()
}

/** 读取某文件的阅读进度，无记录时返回 null */
export function loadProgress(filePath: string): BookProgress | null {
  return progressMap[filePath] ?? null
}

/** 将文件加入最近打开列表（去重置顶，超出上限裁剪） */
export function addRecentFile(filePath: string): void {
  const index = recentFiles.indexOf(filePath)
  if (index >= 0) recentFiles.splice(index, 1)
  recentFiles.unshift(filePath)
  if (recentFiles.length > MAX_RECENT) recentFiles.length = MAX_RECENT
  persist()
}

/** 获取最近打开列表（新→旧） */
export function getRecentFiles(): string[] {
  return [...recentFiles]
}

/** 移除最近记录（用于打开失败后清理） */
export function removeRecentFile(filePath: string): void {
  const index = recentFiles.indexOf(filePath)
  if (index >= 0) {
    recentFiles.splice(index, 1)
    persist()
  }
}

/** 组件统一入口：响应式 settings 单例 */
export function useSettings(): { settings: ReaderSettings } {
  return { settings }
}
