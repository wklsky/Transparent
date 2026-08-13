/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 16:30
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 16:30
 * @FilePath: scripts/smoke.js
 * @Description: UI 冒烟测试：加载构建产物并截图保存，用于验证渲染进程可正常绘制（非白屏）
 * 运行：npm run build && npx electron scripts/smoke.js
 */

const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await win.loadFile(join(__dirname, '../out/renderer/index.html'))
  // 等待首帧渲染与字体加载稳定后再截图
  await new Promise((resolve) => setTimeout(resolve, 2500))
  const image = await win.webContents.capturePage()
  const png = image.toPNG()
  writeFileSync(join(__dirname, 'smoke.png'), png)
  console.log('SMOKE_OK size=' + png.length)
  app.exit(0)
})

// 超时兜底：截图失败时给出明确错误码，避免 CI 挂死
setTimeout(() => {
  console.error('SMOKE_TIMEOUT')
  app.exit(1)
}, 15000)
