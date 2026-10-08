import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  // onnxruntime-web: keep out of optimizeDeps so its wasm sibling resolves via
  // import.meta.url (we also set ort.env.wasm.wasmPaths in scanEngines).
  // Do NOT exclude @gutenye/ocr-browser — Vite then serves /node_modules/… as
  // HTML and dynamic import fails with "Failed to fetch dynamically imported module".
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
    include: [
      "@gutenye/ocr-browser",
      "@gutenye/ocr-common",
      "js-clipper",
      "@techstark/opencv-js",
    ],
  },
  server: {
    port: 7100,
    fs: {
      allow: [path.resolve(__dirname, ".."), path.resolve(__dirname, "../reference/case-ref")],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
