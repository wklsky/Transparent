# TXT/EPUB 透明悬浮阅读器

一款基于 Electron + Vue3 + TypeScript 的桌面端电子书阅读器，核心特性是**窗口背景透明度可调、支持完全透明（仅显示文字）**，正文随窗口大小自动换行重排。可配合视频、网课、游戏等场景实现"悬浮字幕式"阅读。

## 功能特性

- 背景透明度 0%~100% 连续可调，100% 时完全透明，**只显示文字**
- 正文随窗口尺寸变化自动换行、自动重排，无横向滚动条
- 打开并解析 **TXT**（自动检测 UTF-8 / UTF-8 BOM / UTF-16 / GBK 编码）与 **EPUB**（按 OPF spine 顺序解析章节、抽取正文）
- 章节目录导航、上一章 / 下一章跳转
- 阅读进度（章节 + 滚动位置）自动保存与恢复
- 窗口置顶、鼠标穿透（点击直达下层应用）、全局快捷键
- 无边框窗口：拖拽顶部控制条移动、拖拽右下角手柄自由缩放（最小 360×240）
- 控制条「退出」按钮与全局快捷键 `Ctrl+Shift+Q` 均可退出程序
- 字号、行高、字体、文字颜色、背景色、窗口不透明度、文字阴影均可配置
- 最近打开文件、拖拽打开

## 环境要求

- Node.js 20 及以上
- Windows 10/11（开发优先，架构兼容 macOS）

## 安装与运行

```powershell
# 安装依赖（国内可先配置 npm 镜像以加速 Electron 二进制下载）
npm install

# 开发模式（带热更新）
npm run dev

# 类型检查
npm run typecheck

# 构建产物
npm run build

# 预览构建产物
npm run start
```

> 若 Electron 二进制下载缓慢，可设置镜像后重装：
> `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后执行 `npm install`。

运行后点击「打开电子书」选择 `.txt` 或 `.epub`，在控制条设置里把「背景透明度」拖到最右即可完全透明、只显示文字。透明模式下开启「穿透」后，点击正文区域会穿透到下层应用。

### 打包为 Windows 可执行文件

使用 `electron-builder` 将 `out/` 产物打包为 exe / 安装包（已写入 `package.json` 的 `build` 配置）：

```powershell
# 安装打包工具（国内走镜像加速 Electron 二进制）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install -D electron-builder

# 生成免安装的单目录绿色版（含 exe，位于 dist/win-unpacked）
npm run pack

# 生成 NSIS 安装包（.exe 安装程序，位于 dist/）
npm run dist
```

- `npm run pack`：`--dir` 模式，不压缩安装包，产出 `dist/win-unpacked/透明阅读器.exe`，可直接双击运行。
- `npm run dist`：产出 `dist/透明阅读器-1.0.0-setup.exe` 安装程序，默认非一键安装、可改安装目录、创建桌面快捷方式。
- 如需单个免安装 exe 文件，可在 `package.json` 的 `build.win.target` 中追加 `"portable"` 目标，或用 `npm run pack` 后的 `win-unpacked` 目录直接分发。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Shift+O` | 打开文件 |
| `Ctrl+Shift+P` | 切换鼠标穿透 |
| `Ctrl+Shift+↑/↓` | 背景透明度 +5% / -5% |
| `Ctrl+Shift+F` | 切换窗口置顶 |
| `Ctrl+Shift+Q` | 退出 |

## 使用说明

### 1. 打开电子书

- 启动后进入首页，点击「打开电子书」按钮（或按 `Ctrl+Shift+O`）选择本地 `.txt` / `.epub` 文件。
- 也支持把文件直接拖拽到窗口内打开。
- 最近打开的文件会记录在历史列表中，首页可一键再次打开。

### 2. 透明悬浮阅读

- 将顶部控制条的「背景透明度」滑块拖到最右侧（100%），窗口背景完全透明，**只显示文字**，实现悬浮字幕式阅读。
- 拖动滑块到中间位置可半透明叠加在视频、网页等下层内容之上。
- 透明场景下正文仍可正常滚动阅读，文字随窗口大小自动换行、无横向滚动条。

### 3. 鼠标穿透

- 在控制条打开「穿透」开关（或按 `Ctrl+Shift+P`）：开启后点击正文区域会穿透到下层应用（如视频播放器），方便边看边读。
- 控制条面板自身始终可点击，不会被穿透；再次按快捷键即可恢复正常交互。

### 4. 外观调整

- **字号 / 行高**：控制条上的 `A-` / `A+` 与行高滑块，修改即时重排。
- **文字颜色 / 背景色 / 字体**：在控制条设置中调整；背景色可选黑、白、米黄或自定义。
- **文字阴影**：开启后可在复杂背景下提升文字可读性。
- **窗口不透明度**：区别于背景透明度，作用于整个窗口（含文字），用于兜底个别显卡的透明渲染毛边。

### 5. 章节与目录

- 点击控制条「目录」按钮打开左侧章节抽屉，点击任意章节跳转。
- 控制条「上一章 / 下一章」按钮在章节间切换。
- TXT 按 `第X章`、`Chapter N` 等标题自动拆分；EPUB 按正文顺序与内置目录（NCX / nav）解析。

### 6. 进度保存与恢复

- 阅读进度（当前章节 + 滚动位置）自动保存到本地，关闭后重新打开同一文件会恢复到上次位置。
- 设置项（透明度、字号、颜色等）同样自动持久化，重启应用后保留。

### 7. 窗口移动、缩放与退出

- **移动窗口**：在无边框设计下，拖动顶部控制条（按钮以外的区域）即可移动窗口。
- **缩放窗口**：拖拽窗口右下角的三角手柄可自由改变大小，最小 360×240，文字随窗口自动换行重排。
- **置顶**：控制条「置顶」开关或 `Ctrl+Shift+F`：让窗口始终浮于其他应用之上。
- **退出**：控制条「退出」按钮或 `Ctrl+Shift+Q` 退出整个程序（退出前自动保存阅读进度）。注意「关闭」仅关闭当前书本、退回首页，「退出」才会结束进程。

## 项目结构

```text
Transparent/
├── docs/开发计划书.md          # 需求与架构基线文档
├── package.json / electron.vite.config.ts / tsconfig.*.json
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 窗口创建、透明、置顶、穿透、快捷键
│   │   ├── ipc.ts              # IPC 通道注册（打开/解析文件、穿透、置顶、缩放、退出）
│   │   ├── parsers/txtParser.ts# TXT 编码检测 + 章节拆分
│   │   └── parsers/epubParser.ts# EPUB 解析（OPF/spine/TOC）
│   ├── preload/index.ts        # contextBridge 安全暴露 API
│   └── renderer/               # Vue3 渲染进程
│       ├── src/App.vue / main.ts
│       ├── stores/reader.ts    # 阅读状态（Pinia）
│       ├── composables/useSettings.ts  # 设置持久化
│       ├── components/ReaderView.vue / ControlPanel.vue / ChapterSidebar.vue
│       └── views/HomeView.vue
└── tests/                      # 解析器单测与测试样本
```

## 测试

解析器单测覆盖 TXT 多编码与 EPUB2/EPUB3 章节解析：

```powershell
node tests/generate-samples.mjs
node --experimental-strip-types tests/parser.test.mjs
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面容器 | Electron |
| 渲染框架 | Vue 3 `<script setup>` + TypeScript 严格模式 |
| 构建 | electron-vite + Vite |
| 状态管理 | Pinia |
| EPUB 解析 | JSZip + htmlparser2 |
| 编码检测 | iconv-lite |

## 许可

MIT
