# ناوي · Nawy

تطبيق ويب تقدّمي (PWA) بسيط وشخصي لنوايا اليوم. عربي أولاً، يعمل بدون إنترنت، وبياناتك تبقى على جهازك (IndexedDB) مع تصدير واستيراد JSON ونسخة احتياطية اختيارية على Google Drive.

Nawy is a simple, personal, local-first PWA for daily intentions. Arabic-first (RTL), offline-capable, your data stays on your device.

## التشغيل محلياً · Run locally

```bash
python -m http.server 8000      # أو: npx serve
# افتح http://localhost:8000
```

لا تفتح `index.html` بالضغط المزدوج (`file://`): الـ service worker يحتاج `http://localhost` أو `https`.

## الاختبارات · Tests

```bash
npm test
```

اختبارات سريعة بدون أي dependencies (Node 22+). تشمل فحص المستودع: علامات دمج Git، أخطاء الصياغة، الملفات الناقصة، وتطابق أرقام النسخ، وعدم تحميل أي شيء من الشبكة عند الفتح.

الـ CI يشغّل أيضاً (بعد `npm ci`): `npm run typecheck` (TypeScript)، و`npm run check:core` (الملفات المولَّدة مطابقة لـ `src/core`)، و`npm run test:browser` (Chromium حقيقي على الموقع المبني). لا حاجة لتشغيلها محلياً. لتعديل الـ Core: عدّل `src/core/*.ts` ثم شغّل workflow «Generate core files» على الفرع (أو `npm run build:core` إن عمل npm عندك).

## النشر · Deploy

كل push على `main` (وكل pull request للاختبار فقط) يشغّل `.github/workflows/pages.yml`: الاختبارات أولاً، وإذا نجحت تُبنى النسخة (`npm run build` → `_site/`، بدون ملفات التطوير) وتُنشر على GitHub Pages. إذا فشل أي اختبار لا يحدث نشر وتبقى النسخة الحالية كما هي.

إعداد لمرة واحدة: **Settings → Pages → Build and deployment → Source: GitHub Actions**. النطاق المخصص (`nawy.app`) يُضبط من نفس الصفحة.

## قبل كل إصدار · Before a release

عند تغيير أي ملف في التطبيق يجب أن يصل التحديث للمستخدمين، فارفع الرقم في الأماكن التالية معاً (الاختبارات تتحقق أنها متطابقة):

1. `CACHE_NAME` في `service-worker.js`
2. `?v=` على `styles.css` و`translations.js` و`sounds.js` و`share.js` و`sheet-gestures.js` و`app.js` و`nawy-data.js` و`nawy-storage.js` و`nawy-backup.js` و`nawy-ui.js` في `index.html`
3. `importScripts(...)` و`APP_SHELL` في `service-worker.js`

التحديث يظهر للمستخدم كشريط «نسخة جديدة متاحة»، ولا يُعاد تحميل الصفحة بدون موافقته.

## هيكل المشروع · Structure

| الملف | الدور |
|---|---|
| `index.html` | هيكل الصفحة (HTML فقط، وسكربت صغير لضبط الثيم قبل أول رسم) |
| `styles.css` | كل التنسيق |
| `translations.js` | جدول الترجمات (عربي/إنجليزي): بيانات صرفة، بيتحمّل قبل `app.js` |
| `sounds.js` | أصوات الإنجاز/التراجع/الإضافة (Web Audio)، بيتحمّل قبل `app.js` |
| `share.js` | رسم صورة المشاركة ومشاركتها/تنزيلها (Canvas)، بيتحمّل قبل `app.js` |
| `sheet-gestures.js` | إيماءات النوافذ السفلية (سحب للإغلاق وسكرول)، بيتحمّل قبل `app.js`؛ الاستدعاء بيفضل في `app.js` |
| `app.js` | منطق التطبيق (يكلّم الـ Core والتخزين والنسخ الاحتياطي عبر واجهاتهم) |
| `src/core/*.ts` | **مصدر** طبقة البيانات والتخزين (TypeScript). هنا يتم التعديل |
| `nawy-data.js` | الـ Core: schema ودمج وصيغة التصدير، وقرار التذكير وزر «تم ✓»، وحساب الإحصائيات، وكشف التغييرات قبل الحفظ، وتجديد نية اليوم. مشتركة مع الـ service worker. **مولَّد** من المصدر، لا يُعدَّل يدويًا |
| `src/ui/archive/` | شاشتا الأرشيف واختيار نية اليوم بـ React. لكل منهما رسم احتياطي في `index.html` والـ CI يقارن الاثنين |
| `nawy-ui.js` | حزمة React المشتركة للشاشتين. **مولَّدة**، اختيارية وقت التشغيل |
| `nawy-backup.js` | واجهة النسخ الاحتياطي السحابي (`BackupProvider`) وadapter Google Drive. الصفحة لا تعرف Drive مباشرة. **مولَّد** من المصدر |
| `nawy-storage.js` | واجهة التخزين: الوحيدة التي تكلّم Dexie. `app.js` يتعامل مع `storage` فقط. **مولَّد** من المصدر |
| `brand/` | الهوية: المواصفات (`SPEC.md`) وSVG للرمز والأيقونة، وسكربت رسم أيقونة monochrome وشارة الإشعار. لا يُنشر |
| `fonts/` | خط Cairo محلي (woff2، عربي + لاتيني) وترخيصه OFL |
| `service-worker.js` | الكاش وبلا إنترنت والتذكير اليومي |
| `game.html` | لعبة «خذ استراحة» |
| `scripts/build-site.js` | يجهّز `_site/` للنشر |
| `tests/` | الاختبارات |
| `docs/decisions.md` | سجل القرارات المعمارية ولماذا اتُّخذت |
| `AGENTS.md` و`.skills/` | قواعد العمل على ناوي (للمطوّرين وأدوات الذكاء الاصطناعي) |

## قواعد أساسية · Ground rules

- لا تعدّل أي `db.version(n)` قديم في `nawy-data.js`؛ كل تغيير في البيانات نسخة جديدة مع اختبار.
- لا تضع علامات دمج أو تعدّل ملفاً دون تشغيل `npm test`.
- التفاصيل في [`AGENTS.md`](AGENTS.md) و[`docs/decisions.md`](docs/decisions.md).
