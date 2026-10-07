// أسماء بتعرّفها app.js وبتستخدمها ملفات الصفحة الأصغر وقت التشغيل (classic scripts بتتشارك النطاق العام).
// لما app.js نفسه يتفحص، الأسماء دي هتتعرّف من تعريفاته الحقيقية وتتشال من هنا.
declare const $: (selector: string) => any;
declare const $$: (selector: string) => any[];
declare function t(key: string): any;
declare function showToast(message: string, canUndo?: boolean, undoCallback?: (() => void) | null, subtitle?: string): void;
declare function closeOverlay(overlay: Element | null): void;
declare function resolveTheme(): "dark" | "light";
declare let settings: Record<string, any>;
declare let updateRequested: boolean;

interface Navigator { standalone?: boolean }
interface Window { webkitAudioContext?: typeof AudioContext }
interface HTMLElement { _handleTimer?: ReturnType<typeof setTimeout> }
