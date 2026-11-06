// 把 PDF 轉檔用的 worker 複製到 public/，讓後台的瀏覽器載入（npm install 後自動執行）
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
console.log("pdf.worker.min.mjs 已複製到 public/");
