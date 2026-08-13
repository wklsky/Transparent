/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 14:30
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 14:30
 * @FilePath: src/main/parsers/txtParser.ts
 * @Description: TXT 解析：BOM/启发式编码检测 + 章节标题正则拆分，输出统一段落模型
 */

import iconv from 'iconv-lite'
import { readFile } from 'node:fs/promises'
import type { Chapter, ParsedBook, Paragraph, ParagraphType } from '@shared/types'

/** 章节标题行正则：支持中文数字/阿拉伯数字章节、卷、Chapter、常见特殊章节名 */
const CHAPTER_TITLE_RE =
  /^\s*(?:第[0-9零一二三四五六七八九十百千万两]+\s*[章节卷部回集篇][^。！？!?]{0,40}|chapter\s+[0-9ivxlcdm]+\b[^\n]{0,40}|(?:序章|序言|前言|楔子|引子|尾声|终章|后记|番外|完结篇)[^\n]{0,30})\s*$/i

/** 编码探测结果：解码器名称（iconv-lite / TextDecoder 兼容）+ 是否经过 BOM 确认 */
interface EncodingResult {
  codec: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gbk'
}

/**
 * 根据 BOM 与内容启发式判定文本编码。
 * 优先级：BOM 硬性判定 > 严格 UTF-8 校验 > GBK 回退。
 * 这里不对中文统计模型做复杂猜测：GBK 是中文 TXT 除 UTF-8 外最高频编码，误判率可接受。
 */
export function detectEncoding(buffer: Buffer): EncodingResult {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { codec: 'utf-8' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { codec: 'utf-16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { codec: 'utf-16be' }
  }
  // 无 BOM：fatal 模式校验是否为合法 UTF-8 字节序列
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return { codec: 'utf-8' }
  } catch {
    return { codec: 'gbk' }
  }
}

/** 将原始字节按探测出的编码解码为字符串（剥离 BOM） */
export function decodeBuffer(buffer: Buffer, codec: EncodingResult['codec']): string {
  if (codec === 'gbk') {
    return iconv.decode(buffer, 'gbk')
  }
  if (codec === 'utf-16be') {
    // TextDecoder 不支持 utf-16be，逐对字节交换后按 le 解码
    const swapped = Buffer.allocUnsafe(buffer.length)
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      swapped[i] = buffer[i + 1]
      swapped[i + 1] = buffer[i]
    }
    return new TextDecoder('utf-16le').decode(swapped)
  }
  // utf-8 / utf-16le：TextDecoder 自动剥离 BOM
  return new TextDecoder(codec === 'utf-16le' ? 'utf-16le' : 'utf-8').decode(buffer)
}

/**
 * 按章节标题拆分文本。
 * 拆分策略：命中标题行即开启新章节；连续空行折叠为单个空段落；
 * 若未拆出 ≥2 个章节，则整体作为单章（书名即标题）。
 * 边界处理：与文件名相同的首行视为书名行丢弃；首个章节标题前的极短卷首
 * （≤60 字符）并入首章，避免"书名/简介被当成独立章节"。
 */
export function splitChapters(text: string, fallbackTitle: string): Chapter[] {
  let lines = text.replace(/\r\n?/g, '\n').split('\n')
  // 书名行识别：下载类 TXT 常见首行为书名，与文件名一致时丢弃
  const firstNonEmpty = lines.find((l) => l.trim().length > 0)
  if (firstNonEmpty && firstNonEmpty.trim() === fallbackTitle) {
    const idx = lines.indexOf(firstNonEmpty)
    lines = [...lines.slice(0, idx), ...lines.slice(idx + 1)]
  }

  const chapters: Chapter[] = []
  let current: Chapter | null = null

  const flushEmpty = (paragraphs: Paragraph[]): void => {
    // 折叠末尾连续空段落，避免章节结尾冗余
    while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].type === 'empty') {
      paragraphs.pop()
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (CHAPTER_TITLE_RE.test(line)) {
      flushEmpty(current?.paragraphs ?? [])
      current = { title: line, paragraphs: [] }
      chapters.push(current)
      continue
    }
    if (current === null) {
      current = { title: fallbackTitle, paragraphs: [] }
      chapters.push(current)
    }
    const type: ParagraphType = line.length === 0 ? 'empty' : 'text'
    // 折叠连续空行：仅当前一段非 empty 时才追加，保持段间距稳定
    if (type === 'empty' && current.paragraphs[current.paragraphs.length - 1]?.type === 'empty') {
      continue
    }
    current.paragraphs.push({ type, text: raw })
  }
  flushEmpty(current?.paragraphs ?? [])

  // 极短卷首并入首章：首章为 fallback（非章节标题）且内容极少时，视为书名/简介并入第一章
  if (chapters.length >= 2 && chapters[0].title === fallbackTitle) {
    const headText = chapters[0].paragraphs.map((p) => p.text).join('').trim()
    const headCount = chapters[0].paragraphs.filter((p) => p.type !== 'empty').length
    if (headText.length <= 60 && headCount <= 2) {
      chapters[1].paragraphs = [...chapters[0].paragraphs, ...chapters[1].paragraphs]
      chapters.shift()
    }
  }

  // 章节首段落为标题行本身时去重（标题已入 chapters.title）
  for (const chapter of chapters) {
    if (
      chapter.paragraphs[0] &&
      chapter.paragraphs[0].type === 'text' &&
      chapter.paragraphs[0].text.trim() === chapter.title
    ) {
      chapter.paragraphs.shift()
    }
  }
  return chapters
}

/** 解析 TXT 文件为 ParsedBook（供 IPC 调用） */
export async function parseTxtFile(filePath: string): Promise<ParsedBook> {
  const buffer = await readFile(filePath)
  const { codec } = detectEncoding(buffer)
  const text = decodeBuffer(buffer, codec)
  const fileName = filePath.split(/[\\/]/).pop() ?? '未命名'
  // 标题取去除扩展名的文件名
  const title = fileName.replace(/\.txt$/i, '')
  const chapters = splitChapters(text, title)
  return { format: 'txt', title, author: '', filePath, chapters }
}
