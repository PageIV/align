// AGENTS.md 里的受管区块。每轮被自动读到——这是整套设计唯一的硬保底。

import { isActive } from "./item.mjs";

export const HOT_BLOCK_BEGIN = "<!-- align:begin -->";
export const HOT_BLOCK_END = "<!-- align:end -->";

export const DEFAULT_MAX_ITEMS = 20;

export function renderHotBlock(items, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const active = items.filter(isActive).slice(0, Math.max(0, maxItems));

  const lines = [
    HOT_BLOCK_BEGIN,
    "## 已确认前提（由 align 维护，勿手改）",
    ""
  ];

  if (active.length === 0) {
    lines.push("_（暂无）_");
  } else {
    for (const item of active) {
      lines.push(`- [${item.id}] ${item.type}：${item.statement}`);
    }
  }

  lines.push(HOT_BLOCK_END);
  return lines.join("\n");
}

/**
 * 有区块就换成新的，没有就追加到文件末尾。
 * 幂等：同样的 block 写两次，结果字节一致。
 */
export function upsertHotBlock(text, block) {
  const source = String(text ?? "");
  const begin = source.indexOf(HOT_BLOCK_BEGIN);
  const end = source.indexOf(HOT_BLOCK_END);

  if (begin !== -1 && end !== -1 && end > begin) {
    return source.slice(0, begin) + block + source.slice(end + HOT_BLOCK_END.length);
  }

  const trimmed = source.replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

/** 反向：把区块摘出来，只用来做检查，不参与写入。 */
export function readHotBlock(text) {
  const source = String(text ?? "");
  const begin = source.indexOf(HOT_BLOCK_BEGIN);
  const end = source.indexOf(HOT_BLOCK_END);
  if (begin === -1 || end === -1 || end < begin) return null;
  return source.slice(begin, end + HOT_BLOCK_END.length);
}
