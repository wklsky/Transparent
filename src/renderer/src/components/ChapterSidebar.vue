<!--
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/components/ChapterSidebar.vue
 * @Description: 章节目录侧栏：展示书籍全部章节，点击跳转并自动收起
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useReaderStore } from '../stores/reader'

/**
 * 目录侧栏接口：
 * - visible：控制显隐，由父组件 v-model 管理
 */
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const store = useReaderStore()
const chapters = computed(() => store.book?.chapters ?? [])
</script>

<template>
  <aside class="chapter-sidebar">
    <div class="sidebar-header">
      <span>目录</span>
      <button class="bar-btn" @click="emit('update:visible', false)">收起</button>
    </div>
    <div class="sidebar-list">
      <div
        v-for="(chapter, index) in chapters"
        :key="index"
        class="sidebar-item"
        :class="{ active: index === store.chapterIndex }"
        :title="chapter.title"
        @click="store.gotoChapter(index); emit('update:visible', false)"
      >
        {{ chapter.title }}
      </div>
    </div>
  </aside>
</template>
