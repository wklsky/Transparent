/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 14:30
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 14:30
 * @FilePath: src/shared/types.ts
 * @Description: 主进程 / 预加载 / 渲染进程三端共享的数据模型与 IPC 协议类型
 */

/** 正文段落的语义类型：heading 用于章节标题样式，empty 用于保留段间距 */
export type ParagraphType = 'heading' | 'text' | 'empty'

/** 单个段落：type 决定渲染样式，text 为纯文本内容 */
export interface Paragraph {
  type: ParagraphType
  text: string
}

/** 章节：title 用于目录展示，paragraphs 为有序段落集合 */
export interface Chapter {
  title: string
  paragraphs: Paragraph[]
}

/** 书籍格式 */
export type BookFormat = 'txt' | 'epub'

/** 解析完成后的完整书籍对象（主进程持有，不直接跨进程传输正文） */
export interface ParsedBook {
  /** 书籍格式，渲染进程据此决定文案与细节 */
  format: BookFormat
  /** 书籍标题（文件名或 EPUB dc:title） */
  title: string
  /** EPUB 作者，TXT 为空字符串 */
  author: string
  /** 源文件绝对路径，用于进度记忆 */
  filePath: string
  /** 有序章节列表，首个章节可能为整本书（未拆分时） */
  chapters: Chapter[]
}

/**
 * 章节元信息（按需加载用）：仅含目录展示所需的标题，不含正文段落。
 * 打开书籍时主进程只把该结构回传渲染进程，避免整本大书一次性跨进程克隆。
 */
export interface ChapterMeta {
  title: string
}

/**
 * 书籍元信息（按需加载用）：打开时即回传标题列表，正文按章节 index 后取。
 * 渲染进程凭此渲染目录与定位，正文通过 reader:get-chapter 异步获取。
 */
export interface BookMeta {
  format: BookFormat
  title: string
  author: string
  filePath: string
  chapters: ChapterMeta[]
}

/** 按章节下标取正文的返回结构 */
export interface GetChapterResult {
  /** 命中的章节下标 */
  index: number
  /** 该章节有序段落集合；越界时为空数组 */
  paragraphs: Paragraph[]
}

/** 打开文件对话框取消时的返回（book 改为仅含元信息，不含正文） */
export interface OpenFileResult {
  ok: boolean
  /** 取消或失败时为空 */
  book: BookMeta | null
  /** 失败时的用户可读错误信息 */
  error?: string
}

/** 窗口状态快照，渲染进程初始化时同步 UI 开关 */
export interface WindowState {
  passthrough: boolean
  alwaysOnTop: boolean
}

/** 阅读设置（持久化到 localStorage 的完整切片） */
export interface ReaderSettings {
  /** 背景色，hex 格式 */
  bgColor: string
  /** 背景透明度 0~100，100 表示完全透明仅显示文字 */
  bgAlpha: number
  /** 文字颜色，hex 格式 */
  textColor: string
  /** 字号 px */
  fontSize: number
  /** 行高倍数 */
  lineHeight: number
  /** 字体族名称 */
  fontFamily: string
  /** 正文是否显示文字阴影，透明场景下增强可读性 */
  textShadow: boolean
  /** 整体窗口不透明度 0.2~1（区别于背景透明度，作用于整个窗口） */
  windowOpacity: number
}

/** 单个文件的阅读进度 */
export interface BookProgress {
  /** 当前章节下标 */
  chapterIndex: number
  /** 章节内滚动比例 0~1 */
  scrollRatio: number
}

/** 持久化数据根结构（带版本号便于迁移） */
export interface PersistedData {
  version: number
  settings: ReaderSettings
  /** key 为文件绝对路径 */
  progress: Record<string, BookProgress>
  /** 最近打开的文件路径列表（新→旧） */
  recentFiles: string[]
}

/**
 * 渲染进程通过 window.readerAPI 可调用的全部预加载接口。
 * 定义为纯类型（不依赖 electron 命名空间），便于 web 项目在不引入 electron 类型的前提下引用。
 * 取消订阅函数由事件类方法返回，组件在 onUnmounted 中调用以清理监听器，防止内存泄漏。
 */
export interface ReaderApi {
  /** 打开文件对话框并解析所选电子书 */
  openFile: () => Promise<OpenFileResult>
  /** 直接按路径解析电子书（拖放文件时用） */
  openFilePath: (filePath: string) => Promise<OpenFileResult>
  /** 切换鼠标穿透（整窗忽略鼠标并转发下层），返回切换后的状态 */
  togglePassthrough: () => Promise<boolean>
  /** 切换窗口置顶，返回切换后的状态 */
  toggleAlwaysOnTop: () => Promise<boolean>
  /** 设置整体窗口不透明度 0.2~1 */
  setWindowOpacity: (opacity: number) => void
  /** 退出整个应用（等价于全局快捷键 Ctrl+Shift+Q） */
  quitApp: () => void
  /** 通知主进程按增量缩放窗口（无边框窗口自绘手柄用） */
  resizeWindow: (deltaW: number, deltaH: number) => void
  /** 读取当前窗口状态（穿透/置顶） */
  getWindowState: () => Promise<WindowState>
  /** 按章节下标从主进程取回该章正文段落（按需加载，避免整本大书一次性跨进程传输） */
  getChapter: (index: number) => Promise<GetChapterResult>
  /** 拖放文件时获取真实磁盘路径（Electron 30+ 移除了 File.path） */
  getPathForFile: (file: File) => string
  /** 订阅窗口状态变化（穿透/置顶切换后主进程推送），返回取消订阅函数 */
  onWindowStateChange: (cb: (state: WindowState) => void) => () => void
  /** 订阅菜单打开文件请求（全局快捷键触发），返回取消订阅函数 */
  onOpenFileRequest: (cb: () => void) => () => void
  /** 订阅背景透明度增减请求（全局快捷键触发），返回取消订阅函数 */
  onBgAlphaDelta: (cb: (delta: number) => void) => () => void
  /** 鼠标进入/离开控制条时临时开关整窗穿透，保证按钮在穿透模式下仍可点击 */
  setPassthroughHover: (hovering: boolean) => void
}
