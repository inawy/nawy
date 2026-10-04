// نموذج العرض لشاشة الأرشيف: الصفحة بتبنيه (ترجمة، تواريخ، فلترة، ترتيب)،
// والمكوّن بيرسمه بس. كده الاتنين (React والاحتياطي vanilla) بيرسموا نفس البيانات.
export interface ArchiveViewItem {
  id: string;
  text: string;
  dateText: string;
}

export interface ArchiveViewGroup {
  key: string;
  label: string;
  items: ArchiveViewItem[];
}

export type ArchiveView =
  | { kind: "empty"; message: string }
  | { kind: "groups"; restoreLabel: string; deleteLabel: string; groups: ArchiveViewGroup[] };

export interface ArchiveHandlers {
  onRestore(id: string): void;
  onDelete(id: string): void;
}
