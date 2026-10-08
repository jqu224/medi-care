// 把 @gutenye/ocr-models 里的 PP-OCRv4 模型拷进 public/ppocr，
// dev/build 前自动执行，仓库不保存二进制；ORT wasm 由依赖自身按需解析
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "node_modules", "@gutenye", "ocr-models", "assets");
const target = join(root, "public", "ppocr");
if (!existsSync(assets)) {
  console.error("未找到 @gutenye/ocr-models，请先 npm install");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const file of [
  "ch_PP-OCRv4_det_infer.onnx",
  "ch_PP-OCRv4_rec_infer.onnx",
  "ppocr_keys_v1.txt",
]) {
  copyFileSync(join(assets, file), join(target, file));
  console.log("ppocr model ready:", file);
}
