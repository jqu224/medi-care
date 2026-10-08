import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  // onnxruntime-web resolves its wasm loader from import.meta.url.
  // Prebundling breaks that path and falls back to a CDN, so keep it and the
  // PP-OCR packages out of optimizeDeps. Prebundle the CJS/UMD helpers the
  // excluded chain imports so dev and production resolve them the same way.
  optimizeDeps: {
    exclude: ["onnxruntime-web", "@gutenye/ocr-browser", "@gutenye/ocr-common"],
    include: ["js-clipper", "@techstark/opencv-js"],
  },
  server: {
    port: 7100,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
