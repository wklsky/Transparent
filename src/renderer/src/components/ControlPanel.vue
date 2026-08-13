<!--
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/components/ControlPanel.vue
 * @Description: 顶部控制条与设置面板：打开/翻页/目录/穿透/置顶，以及字号、颜色、背景透明度等调节
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettings } from '../composables/useSettings'

/**
 * 控制条对外接口：
 * - showChapter：目录抽屉显隐（v-model 双向绑定）
 * - passthrough：鼠标穿透开关状态（由 App 从主进程同步后传入）
 */
const props = withDefaults(
  defineProps<{
    showChapter: boolean
    passthrough: boolean
  }>(),
  {
    showChapter: false,
    passthrough: false
  }
)

const emit = defineEmits<{
  'update:show-chapter': [value: boolean]
}>()

const store = useReaderStore()
const { settings } = useSettings()

/** 设置面板展开状态（默认为收起，透明场景下保持画面干净） */
const panelOpen = ref(false)
/** 置顶状态：默认与主进程一致（true） */
const alwaysOnTop = ref(true)

/** 窗口不透明度百分比显示值（设置存储为 0.2~1） */
const opacityPercent = computed(() => Math.round(settings.windowOpacity * 100))

const FONT_MIN = 12
const FONT_MAX = 48
const FONT_STEP = 2
const LINE_MIN = 1.2
const LINE_MAX = 2.6
const LINE_STEP = 0.1
const FONT_OPTIONS = ['Microsoft YaHei', 'SimSun', 'KaiTi', 'Arial', 'sans-serif', 'serif'] as const

async function onTogglePassthrough(): Promise<void> {
  await window.readerAPI.togglePassthrough()
}

async function onToggleAlwaysOnTop(): Promise<void> {
  alwaysOnTop.value = await window.readerAPI.toggleAlwaysOnTop()
}

function changeFontSize(delta: number): void {
  settings.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, settings.fontSize + delta))
}

function changeLineHeight(delta: number): void {
  settings.lineHeight = Math.round((Math.min(LINE_MAX, Math.max(LINE_MIN, settings.lineHeight + delta)) * 10)) / 10
}

/** 窗口不透明度滑块：0.2~1 范围写入设置并同步主进程窗口 */
function onOpacityInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  settings.windowOpacity = value / 100
  window.readerAPI.setWindowOpacity(value / 100)
}

function onToggleChapter(): void {
  emit('update:show-chapter', !props.showChapter)
}

/** 退出程序：先持久化当前阅读进度，再通知主进程退出 */
function onQuit(): void {
  store.persistProgress()
  window.readerAPI.quitApp()
}

/**
 * 控制条悬停时临时关闭整窗穿透：forward 模式下正文点击会穿透到下层应用，
 * 但控制条按钮需始终可点。鼠标进入控制条即恢复本窗可交互，离开后由主进程归位穿透状态。
 */
function onBarEnter(): void {
  window.readerAPI.setPassthroughHover(true)
}
function onBarLeave(): void {
  window.readerAPI.setPassthroughHover(false)
}
</script>

<template>
  <header class="control-bar" :class="{ active: panelOpen }" @mouseenter="onBarEnter" @mouseleave="onBarLeave">
    <div class="bar">
      <span v-if="store.book" class="book-title" :title="store.book.filePath">
        {{ store.book.title }}
      </span>
      <button class="bar-btn" title="打开电子书 (Ctrl+Shift+O)" @click="store.openFile()">
        打开
      </button>
      <span class="bar-sep" />
      <button class="bar-btn" :disabled="!store.canPrev" @click="store.prevChapter()">
        上一章
      </button>
      <button class="bar-btn" :disabled="!store.canNext" @click="store.nextChapter()">
        下一章
      </button>
      <span v-if="store.book" class="progress-text">
        {{ store.chapterIndex + 1 }} / {{ store.totalChapters }}
      </span>
      <div class="bar-spacer" />
      <button
        class="bar-btn"
        :class="{ active: passthrough }"
        title="鼠标穿透 (Ctrl+Shift+P)"
        @click="onTogglePassthrough"
      >
        穿透
      </button>
      <button
        class="bar-btn"
        :class="{ active: alwaysOnTop }"
        title="窗口置顶 (Ctrl+Shift+F)"
        @click="onToggleAlwaysOnTop"
      >
        置顶
      </button>
      <button
        v-if="store.book"
        class="bar-btn"
        :class="{ active: showChapter }"
        @click="onToggleChapter"
      >
        目录
      </button>
      <button class="bar-btn" :class="{ active: panelOpen }" @click="panelOpen = !panelOpen">
        设置
      </button>
      <button v-if="store.book" class="bar-btn" @click="store.closeBook()">关闭</button>
      <button class="bar-btn bar-btn--quit" title="退出程序 (Ctrl+Shift+Q)" @click="onQuit">退出</button>
    </div>

    <div v-show="panelOpen" class="panel">
      <div class="set-group">
        <span class="set-label">字号</span>
        <button class="bar-btn" @click="changeFontSize(-FONT_STEP)">−</button>
        <span class="set-num">{{ settings.fontSize }}</span>
        <button class="bar-btn" @click="changeFontSize(FONT_STEP)">＋</button>
      </div>
      <div class="set-group">
        <span class="set-label">行距</span>
        <button class="bar-btn" @click="changeLineHeight(-LINE_STEP)">−</button>
        <span class="set-num">{{ settings.lineHeight.toFixed(1) }}</span>
        <button class="bar-btn" @click="changeLineHeight(LINE_STEP)">＋</button>
      </div>
      <div class="set-group">
        <span class="set-label">背景色</span>
        <input v-model="settings.bgColor" class="set-color" type="color" title="背景颜色" />
      </div>
      <div class="set-group">
        <span class="set-label">背景透明度</span>
        <input v-model.number="settings.bgAlpha" class="set-slider" type="range" min="0" max="100" title="0=不透明，100=完全透明" />
        <span class="set-num">{{ settings.bgAlpha }}%</span>
      </div>
      <div class="set-group">
        <span class="set-label">文字色</span>
        <input v-model="settings.textColor" class="set-color" type="color" title="文字颜色" />
      </div>
      <div class="set-group">
        <span class="set-label">字体</span>
        <select v-model="settings.fontFamily" class="set-select">
          <option v-for="font in FONT_OPTIONS" :key="font" :value="font">{{ font }}</option>
        </select>
      </div>
      <div class="set-group">
        <span class="set-label">窗口不透明度</span>
        <input
          class="set-slider"
          type="range"
          min="20"
          max="100"
          :value="opacityPercent"
          @input="onOpacityInput"
        />
        <span class="set-num">{{ opacityPercent }}%</span>
      </div>
      <label class="set-check" title="透明场景下增强文字可读性">
        <input v-model="settings.textShadow" type="checkbox" />
        文字阴影
      </label>
    </div>
  </header>
</template>
