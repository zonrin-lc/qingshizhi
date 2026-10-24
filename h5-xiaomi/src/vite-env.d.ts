/// <reference types="vite/client" />

// 说明:美术资源以 .webp 形式从 src/assets/ 直接 import(交给 Vite 做哈希与打包),
// 而不是放进 public/ 走裸路径——后者拿不到内容哈希,改图后用户会一直吃旧缓存。
// 这行让 TS 认识 *.webp / *.png 等静态资源的模块声明。

// vite.config.ts define 注入的应用版本号(唯一真源 prot/package.json)
declare const __APP_VERSION__: string;