/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/preload/index.d.ts
 * @Description: 渲染进程侧的 window.readerAPI 类型声明（由 preload/index.ts 的 ReaderApi 推导）
 */

import type { ReaderApi } from './index'

declare global {
  interface Window {
    readerAPI: ReaderApi
  }
}

export {}
