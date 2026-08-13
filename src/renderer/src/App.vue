<!--
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/App.vue
 * @Description: 应用根组件：动态背景透明度、鼠标穿透状态、全局快捷键事件订阅
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useReaderStore } from './stores/reader'
import { useSettings } from './composables/useSettings'
import ControlPanel from './components/ControlPanel.vue'
import ReaderView from './components/ReaderView.vue'
import ChapterSidebar from './components/ChapterSidebar.vue'
import HomeView from './views/HomeView.vue'
import type { WindowState } from '@shared/types'

const store = useReaderStore()
const { settings } = useSettings()

/** 鼠标穿透模式：开启后正文点击直达下层应用（由主进程 setIgnoreMouseEvents 生效） */
const passthrough = ref(false)
/** 目录抽屉显隐 */
const showChapter = ref(false)

const unsubscribeFns: Array<() => void> = []

/** hex 颜色转为带透明度的 rgba 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 背景色计算：bgAlpha 语义为"背景透明程度"，
 * 0 = 完全不透明（纯背景色），100 = 完全透明（仅显示文字）。
 */
const appStyle = computed(() => ({
  backgroundColor: hexToRgba(settings.bgColor, 1 - settings.bgAlpha / 100)
}))

function onWindowStateChange(state: WindowState): void {
  passthrough.value = state.passthrough
}

/** 全局快捷键 Ctrl+Shift+↑/↓ 调整背景透明度 */
function onBgAlphaDelta(delta: number): void {
  settings.bgAlpha = Math.min(100, Math.max(0, settings.bgAlpha + delta))
}

function onBeforeUnload(): void {
  store.persistProgress()
}

/**
 * 无边框窗口 resize 手柄：mousedown 后监听全局 mousemove，
 * 将相对上一帧的位移增量发给主进程累加改变窗口尺寸（受 min 约束）。
 * 用 requestAnimationFrame 节流，避免高频 IPC 抖动。
 */
let resizing = false
let lastX = 0
let lastY = 0
function onResizeMove(event: MouseEvent): void {
  if (!resizing) return
  const deltaW = event.clientX - lastX
  const deltaH = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  window.readerAPI.resizeWindow(deltaW, deltaH)
}
function onResizeUp(): void {
  if (!resizing) return
  resizing = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
  document.body.style.cursor = ''
}
function onResizeDown(event: MouseEvent): void {
  event.preventDefault()
  resizing = true
  lastX = event.clientX
  lastY = event.clientY
  document.body.style.cursor = 'nwse-resize'
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeUp)
}

onMounted(async () => {
  unsubscribeFns.push(
    window.readerAPI.onWindowStateChange(onWindowStateChange),
    window.readerAPI.onOpenFileRequest(() => void store.openFile()),
    window.readerAPI.onBgAlphaDelta(onBgAlphaDelta)
  )
  // 初始化同步窗口状态（穿透/置顶开关与 UI 保持一致）
  const state = await window.readerAPI.getWindowState()
  passthrough.value = state.passthrough
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  unsubscribeFns.forEach((fn) => fn())
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="app" :class="{ passthrough }" :style="appStyle">
    <ControlPanel
      v-model:show-chapter="showChapter"
      :passthrough="passthrough"
    />
    <main class="app-body">
      <ChapterSidebar
        v-if="showChapter && store.book"
        v-model:visible="showChapter"
      />
      <ReaderView v-if="store.book" class="reader-slot" />
      <HomeView v-else />
    </main>
    <!-- 无边框窗口右下角缩放手柄：透明场景下半透明，穿透模式下仍保持可交互 -->
    <div class="resize-handle" title="拖拽缩放窗口" @mousedown="onResizeDown" />
  </div>
</template>
