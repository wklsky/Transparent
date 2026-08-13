/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 16:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 16:00
 * @FilePath: tests/parser.test.mjs
 * @Description: 解析器单测（Node 22 strip-types 直跑 TS）：编码探测、章节拆分、EPUB 解析
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { detectEncoding, splitChapters, decodeBuffer } from '../src/main/parsers/txtParser.ts'
import { parseEpubFile } from '../src/main/parsers/epubParser.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const samples = join(__dirname, 'samples')

let passed = 0
function ok(condition, message) {
  assert.ok(condition, message)
  passed += 1
  console.log(`  ✓ ${message}`)
}

// ---------- TXT 编码探测 ----------
const utf8Buf = readFileSync(join(samples, 'sample-utf8.txt'))
ok(detectEncoding(utf8Buf).codec === 'utf-8', 'UTF-8（无 BOM）应判定为 utf-8')

const gbkBuf = readFileSync(join(samples, 'sample-gbk.txt'))
ok(detectEncoding(gbkBuf).codec === 'gbk', 'GBK 应判定为 gbk')

const gbkText = decodeBuffer(gbkBuf, 'gbk')
ok(gbkText.includes('第一回 雨夜借宿'), 'GBK 文本解码内容正确')

// ---------- TXT 章节拆分 ----------
const utf8Text = decodeBuffer(utf8Buf, 'utf-8')
const chapters = splitChapters(utf8Text, '穿越之透明人生')
ok(chapters.length === 3, `应拆出 3 章（实际 ${chapters.length}）`)
ok(chapters[0].title === '第一章 初到贵境', `第一章标题正确：${chapters[0].title}`)
ok(chapters[2].title === '第三章 迷雾渐起', `第三章标题正确：${chapters[2].title}`)
ok(chapters[0].paragraphs.some((p) => p.text.includes('寒风卷起衣角')), '第一章正文段落完整')
ok(chapters[0].paragraphs.some((p) => p.type === 'empty'), '段落间空行被保留为 empty 段')

// 未命中章节规则时整体单章
const plain = splitChapters('只有一段没有章节标题的文本\n第二行', '无题')
ok(plain.length === 1 && plain[0].title === '无题', '无章节标题时整体作为单章')

// ---------- EPUB 解析 ----------
const book = await parseEpubFile(join(samples, 'sample.epub'))
ok(book.format === 'epub', 'EPUB 格式标记正确')
ok(book.title === '透明测试书', `EPUB 标题取自 dc:title：${book.title}`)
ok(book.author === '测试作者', 'EPUB 作者取自 dc:creator')
ok(book.chapters.length === 3, `应按 spine 拆出 3 章（实际 ${book.chapters.length}）`)
ok(book.chapters[0].title === '第一章 星海', `第一章标题来自 NCX：${book.chapters[0].title}`)
ok(book.chapters[1].paragraphs.some((p) => p.text.includes('导航图上亮起')), '第二章正文抽取正确')
ok(book.chapters[0].paragraphs[0].type === 'heading', 'EPUB 首段 heading 保留（docTitle 逻辑）')
ok(book.chapters[2].paragraphs.length === 2, `第三章段落数正确（实际 ${book.chapters[2].paragraphs.length}）`)

console.log(`\n全部通过：${passed} 项断言`)
