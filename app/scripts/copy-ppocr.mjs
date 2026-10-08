// 把 @gutenye/ocr-models 里的 PP-OCRv4 模型拷进 public/assets/ppocr。
// Zion 静态站只放行部分后缀：.onnx/.bin/.dat 都会被跳过，.wasm 可以上传。
// 内容仍是 ONNX，仅改后缀以便托管；ORT 按字节加载。
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "node_modules", "@gutenye", "ocr-models", "assets");
const target = join(root, "public", "assets", "ppocr");
const legacy = join(root, "public", "ppocr");
if (!existsSync(assets)) {
  console.error("未找到 @gutenye/ocr-models，请先 npm install");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true });
for (const name of readdirSync(target)) {
  if (/\.(onnx|bin|dat|model|txt|wasm)$/.test(name)) unlinkSync(join(target, name));
}
const files = [
  ["ch_PP-OCRv4_det_infer.onnx", "ch_PP-OCRv4_det_infer.wasm"],
  ["ch_PP-OCRv4_rec_infer.onnx", "ch_PP-OCRv4_rec_infer.wasm"],
  ["ppocr_keys_v1.txt", "ppocr_keys_v1.txt"],
];
for (const [src, dest] of files) {
  copyFileSync(join(assets, src), join(target, dest));
  console.log("ppocr model ready:", dest);
}
