/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 16:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 16:00
 * @FilePath: tests/generate-samples.mjs
 * @Description: 生成解析器单测样本：UTF-8/GBK TXT 与最小 EPUB2（含 NCX）
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import JSZip from 'jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, 'samples')
mkdirSync(outDir, { recursive: true })

// ---- UTF-8 TXT ----
const utf8Txt = `穿越之透明人生
第一章 初到贵境
夜色如墨，少年站在陌生的城门前。

寒风卷起衣角，他深吸了一口气。

第二章 遇见故人
城中的灯火次第亮起。
巷口传来熟悉的叫卖声，少年眼眶微热。

第三章 迷雾渐起
一场暴雨冲刷了整条街。
他忽然意识到，这一切并非偶然。
`
writeFileSync(join(outDir, 'sample-utf8.txt'), utf8Txt, 'utf8')

// ---- GBK TXT ----
const gbkTxt = `古风记事
第一回 雨夜借宿
雨下得正紧，书生叩响了山间客店的门。
老板娘端来一碗热姜汤。

第二回 灯下观书
烛火摇曳，书页上浮现一行行小字。
书生看得入神，竟忘了更漏已深。
`
writeFileSync(join(outDir, 'sample-gbk.txt'), iconv.encode(gbkTxt, 'gbk'))

// ---- 最小 EPUB2（含 NCX TOC）----
const epub = new JSZip()
epub.file('mimetype', 'application/epub+zip')
epub.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
epub.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>透明测试书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:identifier id="uid">urn:uuid:test-0001</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="nav.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
  </spine>
</package>`)
epub.file('OEBPS/nav.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>第一章 星海</text></navLabel><content src="chapter1.xhtml"/></navPoint>
    <navPoint id="n2" playOrder="2"><navLabel><text>第二章 航路</text></navLabel><content src="chapter2.xhtml"/></navPoint>
    <navPoint id="n3" playOrder="3"><navLabel><text>第三章 归港</text></navLabel><content src="chapter3.xhtml"/></navPoint>
  </navMap>
</ncx>`)
const chapter1 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章 星海</title></head>
<body><h1>第一章 星海</h1>
<p>飞船驶入寂静的星海。</p><p>舷窗外，无数光点缓缓流淌。</p></body></html>`
const chapter2 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章 航路</title></head>
<body><h2>第二章 航路</h2>
<p>导航图上亮起一条新的航线。</p><p>船长下令加速前进。</p></body></html>`
const chapter3 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第三章 归港</title></head>
<body><h2>第三章 归港</h2>
<p>港口灯火通明，众人终于靠岸。</p></body></html>`
epub.file('OEBPS/chapter1.xhtml', chapter1)
epub.file('OEBPS/chapter2.xhtml', chapter2)
epub.file('OEBPS/chapter3.xhtml', chapter3)

const epubBuffer = await epub.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
writeFileSync(join(outDir, 'sample.epub'), epubBuffer)

console.log('样本生成完成：', outDir)
