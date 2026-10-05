// يتأكد إن nawy-data.js و nawy-storage.js المسجّلين مطابقين لمصدر TypeScript
// (يعيد التوليد ويقارن). لو اختلفوا: شغّل `npm run build:core` وسجّل الناتج.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const files = ["nawy-data.js", "nawy-storage.js", "nawy-ui.js"];
const before = files.map(f => fs.readFileSync(f, "utf8"));
execFileSync(process.execPath, ["scripts/build-core.mjs"], { stdio: "inherit" });
const stale = files.filter((f, i) => fs.readFileSync(f, "utf8") !== before[i]);
if (stale.length) {
  console.error("Generated files are out of date with src/core: " + stale.join(", ") + "\nRun `npm run build:core` and commit the result.");
  process.exit(1);
}
console.log("generated core files are up to date");
