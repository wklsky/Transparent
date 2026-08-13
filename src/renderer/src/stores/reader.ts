/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/stores/reader.ts
 * @Description: 阅读核心状态：书籍数据、章节定位、翻页、进度恢复与持久化
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { OpenFileResult, ParsedBook } from '@shared/types'
import { addRecentFile, loadProgress, removeRecentFile, saveProgress } from '../composables/useSettings'

export const useReaderStore = defineStore('reader', () => {
  /** 当前加载的书籍，null 表示未打开任何书 */
  const book = ref<ParsedBook | null>(null)
  /** 当前章节下标 */
  const chapterIndex = ref(0)
  /** 章节内滚动比例 0~1，切章/恢复进度时使用 */
  const scrollRatio = ref(0)
  /** 打开文件过程中的加载态 */
  const loading = ref(false)
  /** 用户可读的错误信息，非空时展示在界面上 */
  const errorMsg = ref('')
  /** 章节切换时等待目标章节渲染完成 */
  let pendingScrollRatio = 0

  const chapter = computed(() => book.value?.chapters[chapterIndex.value] ?? null)
  const totalChapters = computed(() => book.value?.chapters.length ?? 0)
  const canPrev = computed(() => chapterIndex.value > 0)
  const canNext = computed(() => book.value !== null && chapterIndex.value < (book.value?.chapters.length ?? 1) - 1)

  /** 章节下标安全收窄 */
  function clampChapter(index: number): number {
    const total = book.value?.chapters.length ?? 0
    if (total === 0) return 0
    return Math.min(Math.max(index, 0), total - 1)
  }

  /** 统一处理解析结果：成功则加载书籍并尝试恢复历史进度 */
  async function applyOpenResult(result: OpenFileResult): Promise<boolean> {
    errorMsg.value = ''
    if (!result.ok) {
      errorMsg.value = result.error ?? '打开文件失败'
      return false
    }
    const parsed = result.book as ParsedBook
    book.value = parsed
    chapterIndex.value = 0
    scrollRatio.value = 0
    pendingScrollRatio = 0
    addRecentFile(parsed.filePath)
    // 恢复上次阅读位置：仅在章节数一致时才恢复，避免文件被替换后错位
    const progress = loadProgress(parsed.filePath)
    if (progress && progress.chapterIndex < parsed.chapters.length) {
      chapterIndex.value = progress.chapterIndex
      pendingScrollRatio = progress.scrollRatio
    }
    return true
  }

  /** 等待目标章节挂载后恢复滚动位置（由 ReaderView 调用） */
  function consumePendingRatio(): number {
    const ratio = pendingScrollRatio
    pendingScrollRatio = 0
    return ratio
  }

  async function openFile(): Promise<void> {
    loading.value = true
    try {
      const result = await window.readerAPI.openFile()
      await applyOpenResult(result)
    } catch (error) {
      console.error('[reader] 打开文件异常:', error)
      errorMsg.value = '打开文件时发生异常'
    } finally {
      loading.value = false
    }
  }

  async function openPath(filePath: string): Promise<void> {
    loading.value = true
    try {
      const result = await window.readerAPI.openFilePath(filePath)
      if (!(await applyOpenResult(result))) {
        removeRecentFile(filePath)
      }
    } catch (error) {
      console.error('[reader] 打开路径异常:', error)
      errorMsg.value = '打开文件时发生异常'
    } finally {
      loading.value = false
    }
  }

  /** 持久化当前进度（切章、关闭窗口时调用） */
  function persistProgress(): void {
    if (book.value) {
      saveProgress(book.value.filePath, {
        chapterIndex: chapterIndex.value,
        scrollRatio: scrollRatio.value
      })
    }
  }

  function nextChapter(): void {
    if (!canNext.value) return
    persistProgress()
    chapterIndex.value = clampChapter(chapterIndex.value + 1)
    scrollRatio.value = 0
    pendingScrollRatio = 0
  }

  function prevChapter(): void {
    if (!canPrev.value) return
    persistProgress()
    chapterIndex.value = clampChapter(chapterIndex.value - 1)
    scrollRatio.value = 0
    pendingScrollRatio = 0
  }

  function gotoChapter(index: number): void {
    const target = clampChapter(index)
    if (target === chapterIndex.value) return
    persistProgress()
    chapterIndex.value = target
    scrollRatio.value = 0
    pendingScrollRatio = 0
  }

  function setScrollRatio(ratio: number): void {
    scrollRatio.value = ratio
  }

  /** 关闭当前书籍返回首页 */
  function closeBook(): void {
    persistProgress()
    book.value = null
    chapterIndex.value = 0
    scrollRatio.value = 0
    errorMsg.value = ''
  }

  return {
    book,
    chapterIndex,
    scrollRatio,
    loading,
    errorMsg,
    chapter,
    totalChapters,
    canPrev,
    canNext,
    openFile,
    openPath,
    nextChapter,
    prevChapter,
    gotoChapter,
    setScrollRatio,
    persistProgress,
    consumePendingRatio,
    closeBook
  }
})
