// ALIGNMENT.md 的序列化与反序列化。格式稳定优先于好看：round-trip 必须字节一致。

import { isActive } from "./item.mjs";

const HEADING = /^### (C-\d+) · (\S+) · (\d{4}-\d{2}-\d{2})$/;

const FIELDS = [
  ["断言：", "statement"],
  ["来源：", "source"],
  ["状态：", "status"]
];

function renderItem(item) {
  return [
    `### ${item.id} · ${item.type} · ${item.date}`,
    `断言：${item.statement}`,
    `来源：${item.source}`,
    `状态：${item.status}`
  ];
}

export function serializeLedger(items) {
  const active = items.filter(isActive);
  const retired = items.filter((item) => !isActive(item));

  const lines = [
    "# ALIGNMENT",
    "",
    "当前生效的已确认项。由 align 维护；失效条目保留在下方以便追溯。",
    "",
    "## 生效中",
    ""
  ];

  if (active.length === 0) lines.push("_（暂无）_", "");
  for (const item of active) lines.push(...renderItem(item), "");

  lines.push("## 已失效", "");

  if (retired.length === 0) lines.push("_（暂无）_", "");
  for (const item of retired) lines.push(...renderItem(item), "");

  return lines.join("\n");
}

export function parseLedger(text) {
  const items = [];
  let current = null;

  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trimEnd();
    const heading = HEADING.exec(line);

    if (heading) {
      current = {
        id: heading[1],
        type: heading[2],
        date: heading[3],
        statement: "",
        source: "",
        status: "active"
      };
      items.push(current);
      continue;
    }

    if (!current) continue;

    for (const [prefix, field] of FIELDS) {
      if (line.startsWith(prefix)) {
        current[field] = line.slice(prefix.length);
        break;
      }
    }
  }

  return items;
}
