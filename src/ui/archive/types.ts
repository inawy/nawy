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

// شاشة «اختار نية اليوم»: نفس الفكرة (الصفحة بتبني النموذج والمكوّن بيرسم بس).
export interface TodayPickItem {
  id: string;
  text: string;
  selected: boolean;
}

export type TodayPickView = { kind: "empty"; message: string } | { kind: "list"; items: TodayPickItem[] };

export interface TodayPickHandlers {
  onPick(id: string): void;
}
