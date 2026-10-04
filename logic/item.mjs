// 已确认项的数据模型。纯函数：不碰文件系统、不碰任何协议。

const ID_PATTERN = /^C-(\d+)$/;

export const DEFAULT_TYPE = "concept-alignment";

export function isActive(item) {
  return item.status === "active";
}

/** 把任意文本压成一行——断言必须是"一句话"。 */
export function oneLine(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** 下一个编号。永远取最大值加一，不复用已失效的编号。 */
export function nextId(items) {
  let max = 0;
  for (const item of items) {
    const match = ID_PATTERN.exec(item.id ?? "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `C-${String(max + 1).padStart(3, "0")}`;
}

export function createItem(draft, { id, date, source = "" }) {
  return {
    id,
    type: draft.type ?? DEFAULT_TYPE,
    date,
    statement: oneLine(draft.statement),
    source,
    status: "active"
  };
}

/**
 * 旧的让位给新的：不改历史，只改旧条目的状态。
 * 追加式是刻意的——"我们曾以为是 X、后来改成 Y"本身就是对齐价值。
 */
export function supersede(items, oldId, newId) {
  return items.map((item) =>
    item.id === oldId ? { ...item, status: `superseded by ${newId}` } : item
  );
}
