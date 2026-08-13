/**
 * @Author: wj 3363891051@qq.com
 * @Date: 2026-08-13 15:00
 * @LastEditors: wj 3363891051@qq.com
 * @LastEditTime: 2026-08-13 15:00
 * @FilePath: src/renderer/src/env.d.ts
 * @Description: Vite 客户端类型与 Vue SFC 模块声明
 */

/// <reference types="vite/client" />

// 纯全局声明文件（无顶层 import，避免 isolatedModules 下变成 module 后丢失 *.vue 全局增强）。
// 通过内联 import() 类型查询引用 @shared/types，无需顶层 import 即可拿到 ReaderApi 类型。
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare global {
  interface Window {
    /** 由 preload 经 contextBridge 注入的阅读器 API，详见 @shared/types 的 ReaderApi */
    readerAPI: import('@shared/types').ReaderApi
  }
}
