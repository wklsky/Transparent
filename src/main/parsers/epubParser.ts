/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/main/parsers/epubParser.ts
 * @Description: EPUB 解析：OCF 容器 → container.xml 定位 OPF → manifest/spine → 按序抽取正文与 TOC
 */

import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import * as htmlparser2 from 'htmlparser2'
import type { Chapter, ParsedBook, Paragraph, ParagraphType } from '@shared/types'

/** OPF 中 spine 条目：idref 对应 manifest id，path 为解析后的绝对包内路径 */
interface SpineItem {
  idref: string
  path: string
}

/** TOC 条目：label 显示名，src 为相对 NCX/nav 文档的 href */
interface TocItem {
  label: string
  src: string
}

interface OpfInfo {
  title: string
  author: string
  manifest: Map<string, string>
  spine: SpineItem[]
  ncxPath: string
  /** EPUB3 导航文档路径（properties=nav），NCX 缺失时作为 TOC 兜底 */
  navPath: string
}

/** 需要保留换行的块级语义标签（含标题），用于正文段落切分 */
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'blockquote', 'li', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'br'
])
/** 标题标签 → 段落类型映射 */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** 读取 zip 条目并按文档声明编码解码为字符串（默认 UTF-8） */
async function readZipEntry(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path)
  if (!entry) {
    throw new Error(`EPUB 包内缺少文件: ${path}`)
  }
  const bytes = await entry.async('uint8array')
  const buf = Buffer.from(bytes)
  const encMatch = /<\?xml[^>]*encoding=["']([^"']+)["']/.exec(buf.subarray(0, 512).toString('latin1'))
  const enc = encMatch ? encMatch[1].toLowerCase() : 'utf-8'
  try {
    // EPUB 内部 XHTML 可能声明 gbk/gb2312 等非 UTF-8 编码，统一用 Node 内置 TextDecoder 解码，
    // 避免额外引入 iconv-lite 依赖；未知编码名会抛错，进入 catch 回退 UTF-8
    return new TextDecoder(enc).decode(buf)
  } catch {
    // 编码名不识别时回退 UTF-8，避免解析直接失败
    return new TextDecoder('utf-8').decode(buf)
  }
}

/** 解析 container.xml 得到 OPF 的包内绝对路径 */
function extractOpfPath(containerXml: string): string {
  const match = /<rootfile[^>]*full-path=["']([^"']+)["']/i.exec(containerXml)
  if (!match) {
    throw new Error('container.xml 中未找到 rootfile，EPUB 结构不合法')
  }
  return match[1]
}

/** 规范化包内路径：去 query/hash、反斜杠转正斜杠、并归一 . 与 .. 片段 */
function normalizePath(raw: string, baseDir: string): string {
  const clean = raw.split(/[?#]/)[0].replace(/\\/g, '/')
  const resolved = baseDir ? `${baseDir}/${clean}` : clean
  const parts: string[] = []
  for (const seg of resolved.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

/** 解析 OPF：manifest、spine（含 properties=nav 与 NCX 探测）、metadata */
function parseOpf(opfXml: string, opfDir: string): OpfInfo {
  const manifest = new Map<string, string>()
  const spine: SpineItem[] = []
  let ncxPath = ''
  let navHref = ''

  const parser = new htmlparser2.Parser(
    {
      onopentag(name, attrs) {
        if (name === 'item' && attrs.id && attrs.href) {
          manifest.set(attrs.id, normalizePath(attrs.href, opfDir))
          if (attrs['media-type'] === 'application/x-dtbncx+xml') ncxPath = manifest.get(attrs.id) ?? ''
          if (attrs.properties?.includes('nav')) navHref = manifest.get(attrs.id) ?? ''
        } else if (name === 'itemref' && attrs.idref) {
          spine.push({ idref: attrs.idref, path: '' })
        }
      }
    },
    { xmlMode: true }
  )
  parser.write(opfXml)
  parser.end()

  for (const item of spine) {
    const href = manifest.get(item.idref)
    if (!href) throw new Error(`spine 引用了不存在的 manifest 条目: ${item.idref}`)
    item.path = href
  }
  // EPUB3 的导航文档与 NCX 二选一，nav 优先（同 manifest 条目时仅记录一次）
  if (navHref && spine.some((s) => s.path === navHref) === false) {
    spine.unshift({ idref: 'nav', path: navHref })
  }

  const titleMatch = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opfXml)
  const creatorMatch = /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opfXml)
  return {
    title: (titleMatch?.[1] ?? '').trim(),
    author: (creatorMatch?.[1] ?? '').trim(),
    manifest,
    spine,
    ncxPath,
    navPath: navHref
  }
}

/**
 * 从 NCX 提取 TOC（EPUB2）。
 * 注意 htmlparser2 中 onattribute 先于 onopentag 触发，因此必须显式维护
 * "当前 navPoint 的 label"状态，在 navLabel 结束时落定、在 content 的 src 时成对输出。
 */
function parseNcxToc(ncxXml: string, ncxDir: string): TocItem[] {
  const toc: TocItem[] = []
  let inLabel = false
  let labelBuffer = ''
  let currentLabel = ''

  const parser = new htmlparser2.Parser(
    {
      onopentag(name) {
        if (name === 'navlabel') {
          inLabel = true
          labelBuffer = ''
        }
      },
      ontext(text) {
        if (inLabel) labelBuffer += text
      },
      onclosetag(name) {
        if (name === 'navlabel') {
          inLabel = false
          currentLabel = labelBuffer.replace(/\s+/g, ' ').trim()
          labelBuffer = ''
        } else if (name === 'navpoint') {
          // 离开 navPoint 后清理，避免嵌套 navPoint 的 label 串台
          currentLabel = ''
        }
      },
      onattribute(name, value) {
        if (name === 'src' && value) {
          toc.push({ label: currentLabel, src: normalizePath(value, ncxDir) })
        }
      }
    },
    { xmlMode: true }
  )
  parser.write(ncxXml)
  parser.end()
  return toc.filter((t) => t.label !== '' && t.src !== '')
}

/** 从 EPUB3 导航文档提取 TOC：取 epub:type="toc" 的 nav 内所有链接 */
function parseNavToc(navHtml: string, navDir: string): TocItem[] {
  const toc: TocItem[] = []
  let inTocNav = false
  let inLink = false
  let linkBuffer = ''

  const parser = new htmlparser2.Parser({
    onopentag(name, attrs) {
      if (name === 'nav' && attrs['epub:type']?.includes('toc')) inTocNav = true
      if (inTocNav && name === 'a' && attrs.href) {
        toc.push({ label: '', src: normalizePath(attrs.href, navDir) })
        inLink = true
        linkBuffer = ''
      }
    },
    ontext(text) {
      if (inLink) linkBuffer += text
    },
    onclosetag(name) {
      if (name === 'a' && inLink) {
        inLink = false
        const label = linkBuffer.replace(/\s+/g, ' ').trim()
        if (label) toc[toc.length - 1].label = label
      }
      if (name === 'nav' && inTocNav) inTocNav = false
    }
  })
  parser.write(navHtml)
  parser.end()
  return toc.filter((t) => t.label !== '')
}

/** 抽取单个 XHTML 文档为段落序列；同时返回文档标题（首个 h1/h2）供章节命名兜底 */
function extractDocument(html: string): { paragraphs: Paragraph[]; docTitle: string } {
  const paragraphs: Paragraph[] = []
  let buffer = ''
  let docTitle = ''
  let currentType: ParagraphType = 'text'
  /** head 区域的 title/meta 等不是正文，需跳过以免混入首段 */
  let inHead = false

  const flush = (type: ParagraphType): void => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    buffer = ''
    if (!text) return
    if (type === 'heading' && !docTitle) docTitle = text
    paragraphs.push({ type, text })
  }

  const parser = new htmlparser2.Parser(
    {
      onopentag(name) {
        if (name === 'head') inHead = true
        if (name === 'script' || name === 'style') return
        if (BLOCK_TAGS.has(name)) {
          flush(currentType)
          currentType = HEADING_TAGS.has(name) ? 'heading' : 'text'
        }
      },
      ontext(text) {
        if (inHead) return
        buffer += text
      },
      onclosetag(name) {
        if (name === 'head') inHead = false
        if (name === 'script' || name === 'style') return
        if (BLOCK_TAGS.has(name)) {
          flush(currentType)
          currentType = 'text'
        }
      }
    },
    { decodeEntities: true }
  )
  parser.write(html)
  parser.end()
  flush(currentType)

  // 章节首段若为 heading 与文档标题重复（如 <h1>第一章</h1> 与正文标题相同），保留但不重复计数
  return { paragraphs, docTitle }
}

/**
 * 解析 EPUB 文件为 ParsedBook。
 * 章节顺序严格遵循 OPF spine；章节标题优先级：TOC 匹配 > 文档首个标题 > 文件名。
 */
export async function parseEpubFile(filePath: string): Promise<ParsedBook> {
  const data = await readFile(filePath)
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new Error('无法解压 EPUB，文件可能已损坏')
  }
  if (zip.file('META-INF/encryption.xml')) {
    throw new Error('该 EPUB 已加密（DRM），暂不支持')
  }

  const containerXml = await readZipEntry(zip, 'META-INF/container.xml')
  const opfPath = extractOpfPath(containerXml)
  const opfDir = opfPath.split('/').slice(0, -1).join('/')
  const opfXml = await readZipEntry(zip, opfPath)
  const opf = parseOpf(opfXml, opfDir)

  // TOC 生成：NCX（EPUB2）优先，其次 EPUB3 nav 文档；两者均失败则用正文标题兜底
  let toc: TocItem[] = []
  if (opf.ncxPath) {
    try {
      toc = parseNcxToc(await readZipEntry(zip, opf.ncxPath), opf.ncxPath.split('/').slice(0, -1).join('/'))
    } catch (error) {
      console.warn('[epub] NCX 解析失败，回退到正文标题', error)
    }
  } else if (opf.navPath) {
    try {
      toc = parseNavToc(await readZipEntry(zip, opf.navPath), opf.navPath.split('/').slice(0, -1).join('/'))
    } catch (error) {
      console.warn('[epub] EPUB3 nav 解析失败，回退到正文标题', error)
    }
  }

  const chapters: Chapter[] = []
  for (const item of opf.spine) {
    const html = await readZipEntry(zip, item.path)
    const { paragraphs, docTitle } = extractDocument(html)
    if (paragraphs.length === 0) continue
    const tocMatch = toc.find((t) => t.src === item.path)
    const fileName = item.path.split('/').pop()?.replace(/\.x?html?$/i, '') ?? '未命名'
    chapters.push({
      title: tocMatch?.label || docTitle || fileName,
      paragraphs
    })
  }
  if (chapters.length === 0) {
    throw new Error('EPUB 正文为空，可能为纯图片或结构异常')
  }
  return {
    format: 'epub',
    title: opf.title || filePath.split(/[\\/]/).pop()?.replace(/\.epub$/i, '') || '未命名',
    author: opf.author,
    filePath,
    chapters
  }
}
