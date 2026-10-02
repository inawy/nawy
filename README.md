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

بدون أي dependencies (Node 18+). تشمل فحص المستودع: علامات دمج Git، أخطاء الصياغة، الملفات الناقصة، وتطابق أرقام النسخ.

## النشر · Deploy

كل push على `main` يشغّل `.github/workflows/pages.yml`: الاختبارات أولاً، وإذا نجحت تُبنى النسخة (`npm run build` → `_site/`، بدون ملفات التطوير) وتُنشر على GitHub Pages. إذا فشل أي اختبار لا يحدث نشر وتبقى النسخة الحالية كما هي.

إعداد لمرة واحدة: **Settings → Pages → Build and deployment → Source: GitHub Actions**. النطاق المخصص (`nawy.app`) يُضبط من نفس الصفحة.

## قبل كل إصدار · Before a release

عند تغيير أي ملف في التطبيق يجب أن يصل التحديث للمستخدمين، فارفع الرقم في الأماكن التالية معاً (الاختبارات تتحقق أنها متطابقة):

1. `CACHE_NAME` في `service-worker.js`
2. `?v=` على `nawy-data.js` في `index.html`
3. `importScripts(...)` و`APP_SHELL` في `service-worker.js`

التحديث يظهر للمستخدم كشريط «نسخة جديدة متاحة»، ولا يُعاد تحميل الصفحة بدون موافقته.

## هيكل المشروع · Structure

| الملف | الدور |
|---|---|
| `index.html` | التطبيق (واجهة + منطق) |
| `nawy-data.js` | طبقة البيانات: schema وdefault settings ودمج وصيغة التصدير. مشتركة مع الـ service worker |
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
