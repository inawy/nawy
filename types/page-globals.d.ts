// المكتبات والملفات المولَّدة اللي بتعرّف متغيرات عامة في الصفحة (بتتحمّل بـ <script>).
// أنواع الـ Core بتيجي من مصدر TypeScript نفسه، فاستدعاءاتها من app.js بتتفحص فعليًا.
declare const NawyData: typeof import("../src/core/nawy-data");
declare const NawyStorage: typeof import("../src/core/nawy-storage");
declare const NawyBackup: typeof import("../src/core/nawy-backup");
declare const Dexie: any;
declare const Sortable: any;
declare const confetti: any;
declare const NawyMascot: any;

interface Window {
  NawyUI?: any;
  NAWY_GOOGLE_CLIENT_ID?: string;
  google?: any;
  webkitAudioContext?: typeof AudioContext;
}
interface Navigator {
  standalone?: boolean;
}
interface HTMLElement {
  _handleTimer?: ReturnType<typeof setTimeout>;
}
interface ServiceWorkerRegistration {
  periodicSync?: any;
}
