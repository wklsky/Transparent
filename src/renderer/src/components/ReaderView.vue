<!--
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/components/ReaderView.vue
 * @Description: 正文阅读区：章节渲染、自动换行、滚动比例节流上报与阅读位置恢复
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { useSettings } from '../composables/useSettings'

const store = useReaderStore()
const { settings } = useSettings()
const scrollEl = ref<HTMLElement | null>(null)

/** 滚动节流句柄，防止高频 scroll 事件频繁更新状态 */
let rafId = 0

const chapter = computed(() => store.chapter)

/** 当前章节标题来自 BookMeta（按需加载下正文不含标题，标题由目录元信息提供） */
const chapterTitle = computed(() => store.book?.chapters[store.chapterIndex]?.title ?? '')

/**
 * 过滤与章节标题完全重复的首段 heading：
 * TXT 的标题行与 EPUB docTitle 均已写入 chapterTitle，正文首段若相同则跳过，避免标题双显。
 */
const displayParagraphs = computed(() => {
  const list = chapter.value ?? []
  if (
    list.length > 0 &&
    list[0].type === 'heading' &&
    list[0].text.trim() === chapterTitle.value
  ) {
    return list.slice(1)
  }
  return list
})

/** 章节排版样式：字号/行高/字体/颜色/阴影均由设置实时驱动 */
const chapterStyle = computed(() => ({
  fontSize: `${settings.fontSize}px`,
  lineHeight: settings.lineHeight,
  fontFamily: settings.fontFamily,
  color: settings.textColor,
  textShadow: settings.textShadow ? '0 1px 3px rgba(0, 0, 0, 0.8)' : 'none'
}))

/** 按滚动比例恢复位置（切章、排版变化、恢复进度时使用） */
function restoreScroll(ratio: number): void {
  void nextTick(() => {
    const el = scrollEl.value
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    el.scrollTop = Math.max(0, ratio) * Math.max(max, 0)
  })
}

function onScroll(): void {
  if (rafId !== 0) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const el = scrollEl.value
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    store.setScrollRatio(max > 0 ? el.scrollTop / max : 0)
  })
}

onMounted(() => {
  // 打开书籍后恢复上次阅读位置（store 预置的 pending 比例）
  restoreScroll(store.consumePendingRatio())
})

watch(
  () => store.chapterIndex,
  () => restoreScroll(store.consumePendingRatio())
)

/** 字号/行高/字体变化会改变内容高度，按比例回位避免阅读位置跳变 */
watch(
  () => [settings.fontSize, settings.lineHeight, settings.fontFamily],
  () => restoreScroll(store.scrollRatio)
)

onUnmounted(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="reader-scroll" ref="scrollEl" @scroll="onScroll">
    <article class="chapter" :style="chapterStyle">
      <h2 class="chapter-title">{{ chapterTitle }}</h2>
      <p v-if="store.chapterLoading" class="chapter-loading">章节加载中…</p>
      <template v-for="(para, index) in displayParagraphs" :key="index">
        <h3 v-if="para.type === 'heading'" class="para-heading">{{ para.text }}</h3>
        <p v-else-if="para.type === 'text'" class="para">{{ para.text }}</p>
        <div v-else class="para-gap" />
      </template>
      <p v-if="!store.chapterLoading && displayParagraphs.length > 0" class="chapter-end">— 本章完 —</p>
    </article>
  </div>
</template>
