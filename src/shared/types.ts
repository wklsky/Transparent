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

/** 解析完成后的完整书籍对象 */
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

/** 打开文件对话框取消时的返回 */
export interface OpenFileResult {
  ok: boolean
  /** 取消或失败时为空 */
  book: ParsedBook | null
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
