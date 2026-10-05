/*
 * يولّد nawy-data.js و nawy-storage.js و nawy-ui.js (ملفات classic تشتغل في الصفحة وفي
 * الـ Service Worker وفي Node) من مصدر TypeScript في src/core/ باستخدام Vite.
 *
 *   npm run build:core
 *
 * الملفات الناتجة بتتسجّل في git (عشان الموقع والتطوير المحلي يفضلوا بلا خطوة
 * بناء)، وCI بيتأكد إنها مطابقة للمصدر (npm run check:core).
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".core-out");

const entries = [
  { source: "src/core/nawy-data.ts", name: "NawyData", file: "nawy-data.js" },
  { source: "src/core/nawy-storage.ts", name: "NawyStorage", file: "nawy-storage.js" },
  // واجهة React لشاشة الأرشيف (React نفسه جوه الملف؛ التطبيق مفيهوش dependency وقت التشغيل)
  { source: "src/ui/archive/entry.tsx", name: "NawyUI", file: "nawy-ui.js", ui: true }
];

fs.rmSync(outDir, { recursive: true, force: true });

for (const e of entries) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    plugins: e.ui ? [react()] : [],
    define: e.ui ? { "process.env.NODE_ENV": JSON.stringify("production") } : {},
    build: {
      outDir,
      emptyOutDir: false,
      minify: Boolean(e.ui),
      target: "es2019",
      lib: {
        entry: path.join(root, e.source),
        name: e.name,
        formats: [e.ui ? "iife" : "umd"],
        fileName: () => e.file
      }
    }
  });
}

for (const e of entries) {
  const built = fs.readFileSync(path.join(outDir, e.file), "utf8");
  const banner = `/* GENERATED from ${e.source} by \`npm run build:core\` — do not edit by hand. */\n`;
  fs.writeFileSync(path.join(root, e.file), banner + built);
  console.log("wrote", e.file);
}
fs.rmSync(outDir, { recursive: true, force: true });
