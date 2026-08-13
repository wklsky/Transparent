/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 16:30
 * @FilePath: src/renderer/src/main.ts
 * @Description: 渲染进程入口：挂载 Vue 应用（阅读状态用 reactive 单例，无需 Pinia）
 */

import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

createApp(App).mount('#app')
