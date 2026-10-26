// التومبستون (علامات الحذف النهائي): بتمنع النسخة السحابية أو تاب تانية إنها ترجّع نية اتحذفت.
// ES module (القرار 117): دوال صافية بتاخد القائمة وبترجّع قائمة جديدة (مفيش تعديل في المكان)، فتتختبر في Node.
// الملفات القديمة (classic) بتنادي NawyTombstones.* وبتعيّن النتيجة لـ deletedIds بنفسها.
/** @typedef {{ id: string, deletedAt: number }} Tombstone */

/**
 * يضيف علامة حذف لنية (ويستبدل أي علامة قديمة لنفس الـ id).
 * @param {Tombstone[]} list
 * @param {string} id
 * @param {number} deletedAt
 * @returns {Tombstone[]}
 */
export function addTombstone(list, id, deletedAt) {
  return [...list.filter(item => item.id !== id), { id, deletedAt }];
}

/**
 * يضيف علامات حذف لمجموعة نوايا بنفس الوقت.
 * @param {Tombstone[]} list
 * @param {string[]} ids
 * @param {number} deletedAt
 * @returns {Tombstone[]}
 */
export function addTombstones(list, ids, deletedAt) {
  const incoming = ids.map(id => ({ id, deletedAt }));
  return [...list.filter(item => !incoming.some(next => next.id === item.id)), ...incoming];
}

/**
 * يشيل علامة حذف (للتراجع عن الحذف).
 * @param {Tombstone[]} list
 * @param {string} id
 * @returns {Tombstone[]}
 */
export function removeTombstone(list, id) {
  return list.filter(item => item.id !== id);
}

/**
 * يشيل علامات حذف مجموعة نوايا (للتراجع عن «حذف كل الأرشيف»).
 * @param {Tombstone[]} list
 * @param {string[]} ids
 * @returns {Tombstone[]}
 */
export function removeTombstones(list, ids) {
  return list.filter(item => !ids.includes(item.id));
}

/** @type {any} */ (globalThis).NawyTombstones = { addTombstone, addTombstones, removeTombstone, removeTombstones };
