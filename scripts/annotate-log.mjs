// لما اختبار فشل في CI: بيحوّل آخر جزء من اللوج لـ annotations على الـ job عشان
// التفاصيل تظهر في واجهة GitHub والـ API من غير ما نفتح اللوج الكامل.
import fs from "node:fs";

const file = process.argv[2];
const text = fs.readFileSync(file, "utf8").slice(-24000);
const esc = s => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const chunks = [];
for (let i = 0; i < text.length; i += 3000) chunks.push(text.slice(i, i + 3000));
chunks.slice(-8).forEach((c, i, all) => console.log(`::error title=${file} ${i + 1}/${all.length}::${esc(c)}`));
