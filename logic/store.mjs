// 项目层的读写。宿主无关：只有文件系统，没有 MCP、没有 Codex。

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_CONFIG, defaultConfig, parseConfig, suggestedType } from "./config.mjs";
import { renderHotBlock, upsertHotBlock } from "./hot-block.mjs";
import { createItem, nextId } from "./item.mjs";
import { parseLedger, serializeLedger } from "./ledger.mjs";

export const LEDGER_FILENAME = "ALIGNMENT.md";
export const AGENTS_FILENAME = "AGENTS.md";
export const CONFIG_PATH = join(".align", "config.toml");

async function readIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfig(root) {
  const text = await readIfExists(join(root, CONFIG_PATH));
  return text ? parseConfig(text) : defaultConfig();
}

export async function readItems(root) {
  const text = await readIfExists(join(root, LEDGER_FILENAME));
  return text ? parseLedger(text) : [];
}

/**
 * 落地到项目层：写账本，再更新 AGENTS.md 的受管区块。
 * 只碰受管区块，用户写在别处的内容一个字节都不动。
 */
export async function commitItems(root, drafts, { date, source = "" } = {}) {
  const config = await readConfig(root);
  const existing = await readItems(root);
  const suggested = suggestedType(config);

  const created = [];
  let known = existing;

  for (const draft of drafts) {
    const item = createItem(draft, { id: nextId(known), date, source, defaultType: suggested });
    created.push(item);
    known = [...known, item];
  }

  await writeFile(join(root, LEDGER_FILENAME), serializeLedger(known), "utf8");

  const agentsPath = join(root, AGENTS_FILENAME);
  const agents = (await readIfExists(agentsPath)) ?? "";
  const maxItems = Number(config.hot_block_max_items) || DEFAULT_CONFIG.hot_block_max_items;

  await writeFile(
    agentsPath,
    upsertHotBlock(agents, renderHotBlock(known, { maxItems })),
    "utf8"
  );

  return { created, items: known, config };
}
