import type { ArchiveHandlers, ArchiveView } from "./types.ts";

// نفس الـ DOM والـ classes اللي بيرسمها الكود الاحتياطي في index.html بالظبط
// (اختبار CI بيقارن الاتنين). أي تعديل شكل = تعديل CSS، مش هنا.
const RestoreIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <path d="M3 12a9 9 0 1 0 2.6-6.3" />
    <path d="M3 4v5h5" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <path d="M3 6H21" />
    <path d="M19 6V22H5V6" />
    <path d="M8 6V4H16V6" />
  </svg>
);

export function ArchiveList({ view, handlers }: { view: ArchiveView; handlers: ArchiveHandlers }) {
  if (view.kind === "empty") {
    return (
      <div className="empty">
        <div className="empty-title">{view.message}</div>
      </div>
    );
  }

  return (
    <>
      {view.groups.map(group => (
        <div className="archive-group" key={group.key}>
          <div className="archive-group-label">{group.label}</div>
          <div className="archive-box">
            {group.items.map((item, index) => (
              <div className="archive-item" key={item.id || index}>
                <div className="archive-item-copy">
                  <div className="archive-item-text">{item.text}</div>
                  <div className="archive-item-date">{item.dateText}</div>
                </div>
                <div className="archive-item-actions">
                  <button
                    className="archive-icon-btn"
                    type="button"
                    aria-label={view.restoreLabel}
                    onClick={() => handlers.onRestore(item.id)}
                  >
                    <RestoreIcon />
                  </button>
                  <button
                    className="archive-icon-btn danger"
                    type="button"
                    aria-label={view.deleteLabel}
                    onClick={() => handlers.onDelete(item.id)}
                  >
                    <DeleteIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
