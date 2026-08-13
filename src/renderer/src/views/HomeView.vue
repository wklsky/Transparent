<!--
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/views/HomeView.vue
 * @Description: 未打开书籍时的首页：打开按钮、拖拽投放区、最近打开列表与错误提示
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useReaderStore } from '../stores/reader'
import { getRecentFiles } from '../composables/useSettings'

const store = useReaderStore()
const recentFiles = ref<string[]>([])
const dragover = ref(false)

const unsubscribeFns: Array<() => void> = []

function refreshRecent(): void {
  recentFiles.value = getRecentFiles()
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** 拖放文件：经 preload 的 webUtils 获取磁盘真实路径后走统一打开流程 */
async function onDrop(event: DragEvent): Promise<void> {
  dragover.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const path = window.readerAPI.getPathForFile(file)
  if (path) await store.openPath(path)
}

onMounted(() => {
  refreshRecent()
  // 全局快捷键打开文件后同步最近列表
  unsubscribeFns.push(window.readerAPI.onOpenFileRequest(refreshRecent))
})

onUnmounted(() => {
  unsubscribeFns.forEach((fn) => fn())
})
</script>

<template>
  <div
    class="home-view"
    @dragover.prevent="dragover = true"
    @dragleave="dragover = false"
    @drop.prevent="onDrop"
  >
    <div class="home-logo">含光</div>
    <!-- <p class="home-sub">支持 TXT / EPUB</p> -->
    <button class="home-btn" :disabled="store.loading" @click="store.openFile()">
      {{ store.loading ? '打开中…' : '打开电子书' }}
    </button>
    <div class="drop-zone" :class="{ dragover }">
      {{ dragover ? '松开以打开' : '或将文件拖拽到此处' }}
    </div>
    <p v-if="store.errorMsg" class="error-tip">{{ store.errorMsg }}</p>
    <div v-if="recentFiles.length" class="recent-list">
      <div class="recent-title">最近打开</div>
      <div
        v-for="path in recentFiles"
        :key="path"
        class="recent-item"
        :title="path"
        @click="store.openPath(path)"
      >
        {{ fileName(path) }}
      </div>
    </div>
  </div>
</template>
