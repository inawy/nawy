import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ArchiveList } from "./ArchiveList.tsx";
import type { ArchiveHandlers, ArchiveView } from "./types.ts";

export type { ArchiveHandlers, ArchiveView } from "./types.ts";

const roots = new WeakMap<Element, Root>();

// بيرسم شاشة الأرشيف جوه container. بيتنادى من renderArchive() في index.html
// كل مرة البيانات أو البحث أو اللغة تتغير. flushSync عشان الرسم يتم فورًا
// (زي الكود الاحتياطي) فأي كود بعده يلاقي الـ DOM جاهز.
export function render(container: Element, view: ArchiveView, handlers: ArchiveHandlers): void {
  let root = roots.get(container);
  if (!root) {
    container.innerHTML = ""; // أي محتوى vanilla قديم
    root = createRoot(container);
    roots.set(container, root);
  }
  const r = root;
  flushSync(() => r.render(<ArchiveList view={view} handlers={handlers} />));
}
