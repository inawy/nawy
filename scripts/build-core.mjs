/*
 * يولّد nawy-data.js و nawy-storage.js (ملفات classic/UMD تشتغل في الصفحة وفي
 * الـ Service Worker وفي Node) من مصدر TypeScript في src/core/ باستخدام Vite.
 *
 *   npm run build:core
 *
 * الملفات الناتجة بتتسجّل في git (عشان الموقع والتطوير المحلي يفضلوا بلا خطوة
 * بناء)، وCI بيتأكد إنها مطابقة للمصدر (npm run check:core).
 */
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".core-out");

const entries = [
  { source: "src/core/nawy-data.ts", name: "NawyData", file: "nawy-data.js" },
  { source: "src/core/nawy-storage.ts", name: "NawyStorage", file: "nawy-storage.js" }
];

fs.rmSync(outDir, { recursive: true, force: true });

for (const e of entries) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      target: "es2019",
      lib: {
        entry: path.join(root, e.source),
        name: e.name,
        formats: ["umd"],
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
