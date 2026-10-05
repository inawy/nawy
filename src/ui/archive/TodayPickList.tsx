import type { TodayPickHandlers, TodayPickView } from "./types.ts";

// نفس الـ DOM والـ classes اللي بيرسمها الكود الاحتياطي في index.html
// (renderTodayPickListFallback). اختبار CI بيقارن الاتنين.
const CheckIcon = () => (
  <svg className="icon" viewBox="0 0 24 24">
    <path d="M4 12.5 9 17.5 20 6" />
  </svg>
);

export function TodayPickList({ view, handlers }: { view: TodayPickView; handlers: TodayPickHandlers }) {
  if (view.kind === "empty") {
    return (
      <div className="empty">
        <div className="empty-title">{view.message}</div>
      </div>
    );
  }

  return (
    <div className="today-pick-box">
      {view.items.map((item, index) => (
        <button
          type="button"
          className={"today-pick-row" + (item.selected ? " selected" : "")}
          key={item.id || index}
          onClick={() => handlers.onPick(item.id)}
        >
          <div className="today-pick-radio">{item.selected ? <CheckIcon /> : null}</div>
          <span className="today-pick-text">{item.text}</span>
        </button>
      ))}
    </div>
  );
}
