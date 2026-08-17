/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 16:30
 * @FilePath: src/renderer/src/stores/reader.ts
 * @Description: 阅读核心状态：书籍数据、章节定位、翻页、进度恢复与持久化。
 * 轻量化实现：单窗口阅读器无需 Pinia 的多 store 能力，直接用 Vue reactive 单例，
 * 减少一层响应式封装开销与依赖体积；对外导出 useReaderStore() 保持组件调用签名不变。
 */

import { reactive, computed } from 'vue'
import type { BookMeta, ChapterMeta, OpenFileResult, Paragraph } from '@shared/types'
import { addRecentFile, loadProgress, removeRecentFile, saveProgress } from '../composables/useSettings'

/**
 * 阅读 store 完整契约：state 基础字段 + 派生 computed + 操作方法。
 * 必须显式声明为接口再标注给 reactive 单例，否则 state 会被推断为仅含初始 5 字段的字面量类型，
 * Object.assign 注入的方法/computed 在运行时存在、但 TypeScript 不可见，导致组件调用全部类型报错。
 */
interface ReaderStore {
  book: BookMeta | null
  /** 当前章节下标 */
  chapterIndex: number
  /** 章节内滚动比例 0~1，切章/恢复进度时使用 */
  scrollRatio: number
  /** 打开文件过程中的加载态 */
  loading: boolean
  /** 章节正文异步加载中的加载态 */
  chapterLoading: boolean
  /** 用户可读的错误信息，非空时展示在界面上 */
  errorMsg: string
  /** 当前章节正文段落（按需从主进程加载，非整本常驻） */
  chapter: Paragraph[] | null
  /** 当前书籍章节总数 */
  totalChapters: number
  /** 是否可向前翻章 */
  canPrev: boolean
  /** 是否可向後翻章 */
  canNext: boolean
  openFile: () => Promise<void>
  openPath: (filePath: string) => Promise<void>
  nextChapter: () => void
  prevChapter: () => void
  gotoChapter: (index: number) => void
  /** 按章节下标向主进程索取正文并写入 store.chapter（带加载态与重复请求去抖） */
  loadChapter: (index: number) => Promise<void>
  setScrollRatio: (ratio: number) => void
  persistProgress: () => void
  consumePendingRatio: () => number
  closeBook: () => void
}

/** 阅读状态单例：整生命周期只创建一个 reactive 对象，跨组件共享 */
const state = reactive({
  /** 当前加载的书籍元信息（仅含标题列表，不含正文），null 表示未打开任何书 */
  book: null as BookMeta | null,
  chapterIndex: 0,
  scrollRatio: 0,
  loading: false,
  chapterLoading: false,
  errorMsg: ''
}) as ReaderStore

/** 章节切换时等待目标章节渲染完成（非响应式临时量，不放进 reactive） */
let pendingScrollRatio = 0
/** 最近一次发起的章节加载请求序号，用于丢弃过期响应（快速翻章时避免正文错乱） */
let chapterLoadSeq = 0

const totalChapters = computed(() => state.book?.chapters.length ?? 0)
const canPrev = computed(() => state.chapterIndex > 0)
const canNext = computed(
  () => state.book !== null && state.chapterIndex < (state.book?.chapters.length ?? 1) - 1
)

/** 章节下标安全收窄 */
function clampChapter(index: number): number {
  const total = state.book?.chapters.length ?? 0
  if (total === 0) return 0
  return Math.min(Math.max(index, 0), total - 1)
}

/** 统一处理解析结果：成功则加载书籍并尝试恢复历史进度 */
async function applyOpenResult(result: OpenFileResult): Promise<boolean> {
  state.errorMsg = ''
  if (!result.ok) {
    state.errorMsg = result.error ?? '打开文件失败'
    return false
  }
  const parsed = result.book as BookMeta
  state.book = parsed
  state.chapterIndex = 0
  state.scrollRatio = 0
  pendingScrollRatio = 0
  addRecentFile(parsed.filePath)
  // 恢复上次阅读位置：仅在章节数一致时才恢复，避免文件被替换后错位
  const progress = loadProgress(parsed.filePath)
  if (progress && progress.chapterIndex < parsed.chapters.length) {
    state.chapterIndex = progress.chapterIndex
    pendingScrollRatio = progress.scrollRatio
  }
  // 按需加载：打开即拉取当前章节正文（首章或恢复进度所在章）
  await loadChapter(state.chapterIndex)
  return true
}

/** 等待目标章节挂载后恢复滚动位置（由 ReaderView 调用） */
function consumePendingRatio(): number {
  const ratio = pendingScrollRatio
  pendingScrollRatio = 0
  return ratio
}

async function openFile(): Promise<void> {
  state.loading = true
  try {
    const result = await window.readerAPI.openFile()
    await applyOpenResult(result)
  } catch (error) {
    console.error('[reader] 打开文件异常:', error)
    state.errorMsg = '打开文件时发生异常'
  } finally {
    state.loading = false
  }
}

async function openPath(filePath: string): Promise<void> {
  state.loading = true
  try {
    const result = await window.readerAPI.openFilePath(filePath)
    if (!(await applyOpenResult(result))) {
      removeRecentFile(filePath)
    }
  } catch (error) {
    console.error('[reader] 打开路径异常:', error)
    state.errorMsg = '打开文件时发生异常'
  } finally {
    state.loading = false
  }
}

/** 持久化当前进度（切章、关闭窗口时调用） */
function persistProgress(): void {
  if (state.book) {
    saveProgress(state.book.filePath, {
      chapterIndex: state.chapterIndex,
      scrollRatio: state.scrollRatio
    })
  }
}

/**
 * 按需加载指定章节正文：向主进程索取该章段落并写入 store.chapter。
 * 关键：用递增序列号 chapterLoadSeq 丢弃过期响应，避免快速翻章时旧响应覆盖新章节正文。
 * 越界下标直接清空当前章，保持与切章边界一致的行为。
 */
async function loadChapter(index: number): Promise<void> {
  if (!state.book) return
  const seq = ++chapterLoadSeq
  const clamped = clampChapter(index)
  state.chapterLoading = true
  try {
    const res = await window.readerAPI.getChapter(clamped)
    // 若期间又发起了更新的加载请求，丢弃本次（已过期）的响应
    if (seq !== chapterLoadSeq) return
    state.chapter = res.paragraphs
  } catch (error) {
    console.error('[reader] 加载章节异常:', error)
    if (seq === chapterLoadSeq) state.chapter = null
  } finally {
    if (seq === chapterLoadSeq) state.chapterLoading = false
  }
}

function nextChapter(): void {
  if (!canNext.value) return
  persistProgress()
  state.chapterIndex = clampChapter(state.chapterIndex + 1)
  state.scrollRatio = 0
  pendingScrollRatio = 0
  void loadChapter(state.chapterIndex)
}

function prevChapter(): void {
  if (!canPrev.value) return
  persistProgress()
  state.chapterIndex = clampChapter(state.chapterIndex - 1)
  state.scrollRatio = 0
  pendingScrollRatio = 0
  void loadChapter(state.chapterIndex)
}

function gotoChapter(index: number): void {
  const target = clampChapter(index)
  if (target === state.chapterIndex) return
  persistProgress()
  state.chapterIndex = target
  state.scrollRatio = 0
  pendingScrollRatio = 0
  void loadChapter(target)
}

function setScrollRatio(ratio: number): void {
  state.scrollRatio = ratio
}

/** 关闭当前书籍返回首页 */
function closeBook(): void {
  persistProgress()
  state.book = null
  state.chapter = null
  state.chapterLoading = false
  state.chapterIndex = 0
  state.scrollRatio = 0
  state.errorMsg = ''
}

/**
 * 兼容原有调用：把 computed 与方法直接挂到 state 这个 reactive 单例上并原样返回。
 * 关键：绝不能用 reactive({ ...state, ... }) 解构，否则 ...state 会把 book 等字段按值复制到新对象，
 * 之后 state.book = parsed 改的是原单例、组件持有的 store.book 仍是旧 null，导致阅读视图永不渲染。
 * computed 放入 reactive 会自动解包为值（store.chapter 即章节对象），方法可正常调用。
 * 整个应用生命周期返回同一个 reactive 单例，保证跨组件状态共享与响应式同步。
 */
// 模块加载时即把派生状态与操作挂载到 state，使其成为带方法的完整 store
Object.assign(state, {
  chapter,
  totalChapters,
  canPrev,
  canNext,
  openFile,
  openPath,
  nextChapter,
  prevChapter,
  gotoChapter,
  loadChapter,
  setScrollRatio,
  persistProgress,
  consumePendingRatio,
  closeBook
})
export function useReaderStore() {
  return state
}
