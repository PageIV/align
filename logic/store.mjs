// 项目层的读写。宿主无关：只有文件系统，没有 MCP、没有 Codex。

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defaultConfig, parseConfig, resolveType, suggestedType } from "./config.mjs";
import { HOT_BLOCK_BEGIN, removeHotBlock } from "./hot-block.mjs";
import { createEntry, deliverable, parseInbox, serializeInbox } from "./inbox.mjs";
import {
  createItem,
  isActive,
  nextId,
  oneLine,
  retire,
  successorOf,
  supersede
} from "./item.mjs";
import { parseLedger, serializeLedger } from "./ledger.mjs";

export const LEDGER_FILENAME = "ALIGNMENT.md";
export const AGENTS_FILENAME = "AGENTS.md";
export const CONFIG_PATH = join(".align", "config.toml");
export const INBOX_PATH = join(".align", "inbox.md");

async function readIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// 同一个目录有时写成 "/x/y"，有时写成 "/x/y/"，而这一层的缓存与文件都以字符串为键。
// 归一化的地方只在这里，别处按原样传。
export function normalizeRoot(root) {
  const text = String(root ?? "").trim();
  return text.length > 1 ? text.replace(/\/+$/, "") : text;
}

export async function readConfig(root) {
  const text = await readIfExists(join(normalizeRoot(root), CONFIG_PATH));
  return text ? parseConfig(text) : defaultConfig();
}

export async function readItems(root) {
  const text = await readIfExists(join(normalizeRoot(root), LEDGER_FILENAME));
  return text ? parseLedger(text) : [];
}

// ---------------------------------------------------------------------------
// 收件箱：复述的一次性投递区
// ---------------------------------------------------------------------------

export async function readInbox(root) {
  const text = await readIfExists(join(normalizeRoot(root), INBOX_PATH));
  return text ? parseInbox(text) : [];
}

export async function writeInbox(root, entries) {
  const base = normalizeRoot(root);
  const file = join(base, INBOX_PATH);

  // 空了就把文件摘掉，不留一个只有表头的空文件：.align/ 会跟着项目进 git，
  // 别人 clone 下来不该白看见一个空收件箱。读到"文件不在"仍是空收件箱。
  if (entries.length === 0) {
    await rm(file, { force: true });
    return;
  }

  await mkdir(join(base, ".align"), { recursive: true });
  await writeFile(file, serializeInbox(entries), "utf8");
}

export async function addRestatements(root, texts, { at, session = "" } = {}) {
  const entries = await readInbox(root);
  const added = texts.map((text) => createEntry(text, { at, session }));
  await writeInbox(root, [...entries, ...added]);
  return added;
}

/**
 * 投递并消费：挑出该给这一轮的复述，同时把它们从收件箱里删掉。
 *
 * 写回失败就一条都不投——条目还在收件箱里，下一轮还会来。宁可晚到，不要重复。
 */
export async function takeRestatements(root, { session = "", isMain } = {}) {
  const entries = await readInbox(root);
  const taken = deliverable(entries, { session, isMain });
  if (taken.length === 0) return [];

  try {
    await writeInbox(
      root,
      entries.filter((entry) => !taken.includes(entry))
    );
  } catch {
    return [];
  }

  return taken;
}

// ---------------------------------------------------------------------------
// "这一轮在哪"：主线程还是侧聊
// ---------------------------------------------------------------------------

// MCP 工具调用里没有会话信息——server 不知道自己是主线程调的还是侧聊调的。钩子知道
// （它有 session_id 与 transcript_path）。所以钩子每次提问时把"这一轮在哪"记下来，
// align_land 读它：在主线程里落的"复述"当场说出来，在侧聊里落的才进收件箱。
//
// 放 tmp 而不是项目里：这是个每轮都变的派生物，塞进项目会让 git status 一直脏。
// 按项目根分开存，两个项目同时开着也不会串。
//
// 路径写死 /tmp，不用 os.tmpdir()：钩子是宿主直接 exec 的（带着 TMPDIR），MCP server
// 只拿到 HOME 与 PATH（没有 TMPDIR，os.tmpdir() 会退回 /tmp）——用 os.tmpdir() 两边
// 会各写各的，标记永远读不到。按 uid 分一层，免得同机器上两个用户互相踩。

const SESSION_DIR = join("/tmp", `align-session-${typeof process.getuid === "function" ? process.getuid() : "u"}`);

function sessionKey(root) {
  return createHash("sha1").update(normalizeRoot(root)).digest("hex").slice(0, 16);
}

function sessionFile(root) {
  return join(SESSION_DIR, `${sessionKey(root)}.json`);
}

export async function writeSessionMarker(root, payload) {
  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(sessionFile(root), JSON.stringify(payload), "utf8");
}

export async function readSessionMarker(root) {
  const text = await readIfExists(sessionFile(root));
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 这一次该不该把侧栏抢过来
// ---------------------------------------------------------------------------

// 面板每次被**挂载**都会跑一遍它自己的脚本——包括你上滑聊天记录时，宿主把历史里的
// MCP App 重新挂载起来。早先面板一挂载就无条件要求 fullscreen，于是每滑过一条历史
// 账本，侧栏就被重新抢一次（2026-10-07 实测：连着打开两个）。
//
// 所以"要不要展开"改成一次性的：align_open_ledger 被调用时在这里放一个待取标记，
// 面板挂载后调 align_take_open 来取。取过就没了——历史回放取不到，也就抢不走侧栏。
// 带 TTL 是因为"放了标记但面板始终没挂载"（工具失败、宿主没渲染）时会留下一个陈标记，
// 不能让它以后被误取。

export const PANEL_OPEN_TTL_MS = 120_000;

function panelOpenFile(root) {
  return join(SESSION_DIR, `${sessionKey(root)}.open`);
}

/** 放一个"下一次面板挂载可以展开"的待取标记。 */
export async function markPanelOpen(root, { at = Date.now() } = {}) {
  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(panelOpenFile(root), String(at), "utf8");
}

/** 取走这一次的展开机会。取过就消费掉——取不到、或者已经过期，都是 false。 */
export async function takePanelOpen(root, { now = Date.now() } = {}) {
  const file = panelOpenFile(root);
  const text = await readIfExists(file);
  await rm(file, { force: true });
  if (!text) return false;

  const at = Number(text);
  return Number.isFinite(at) && now - at <= PANEL_OPEN_TTL_MS;
}

/**
 * 落地：写账本。
 *
 * 曾经这里还会把热块写进 AGENTS.md。已退役（工单 13）——热块现在由
 * UserPromptSubmit 钩子在每次提问时从账本现渲染，写进文件反而会留一份会过期的副本。
 * 顺手做的唯一一件事：老仓库的 AGENTS.md 里若还留着受管区块，把它摘掉。
 * 摘的时候只碰区块本身，用户写在别处的内容一个字节都不动。
 *
 * draft 上可以带 `supersedes: "C-0NN"`：这条新条目取代某条已有的（工单 04）。旧条目不删，
 * 状态改成 `superseded by <新 id>` 并移进"已失效"区，链留在文件里。
 */
export async function commitItems(root, drafts, { date, source = "" } = {}) {
  const base = normalizeRoot(root);
  const config = await readConfig(base);
  const existing = await readItems(base);
  const suggested = suggestedType(config);

  const created = [];
  const replaced = [];
  const warnings = [];
  let known = existing;

  for (const draft of drafts) {
    // 取代的目标先解析。目标不存在、或者已经失效时**照样落地**——断言是用户在表单上确认过的，
    // 不能因为模型填错编号就丢掉；丢掉的只是"取代"这层关系，并且当场报出来。
    let target = null;

    if (draft.supersedes) {
      target = known.find((item) => item.id === draft.supersedes) ?? null;

      if (!target) {
        warnings.push(`${draft.supersedes} 不在账本里——新条目照落，但没有可取代的对象。`);
      } else if (!isActive(target)) {
        const successorId = successorOf(target);
        const successor = successorId ? known.find((item) => item.id === successorId) : null;

        if (successor && successor.statement === oneLine(draft.statement)) {
          // 同一次取代被重放（模型重试、用户又点了一遍）：不再长出一条重复的断言。
          warnings.push(`${target.id} 已经由 ${successor.id} 取代，同一条断言没有重复落地。`);
          continue;
        }

        warnings.push(`${target.id} 已经是失效条目（${target.status}）——新条目照落，没有改它。`);
        target = null;
      }
    }

    const item = createItem(draft, { id: nextId(known), date, source, defaultType: suggested });
    created.push(item);
    known = [...known, item];

    if (target) {
      known = supersede(known, target.id, item.id);
      replaced.push({ from: target.id, to: item.id });
    }
  }

  await writeFile(join(base, LEDGER_FILENAME), serializeLedger(known), "utf8");

  const agentsPath = join(base, AGENTS_FILENAME);
  const agents = await readIfExists(agentsPath);
  if (agents !== null && agents.includes(HOT_BLOCK_BEGIN)) {
    await writeFile(agentsPath, removeHotBlock(agents), "utf8");
  }

  return { created, items: known, config, replaced, warnings };
}

/** 账本改动之后统一从这里写，省得每处都记着 serialize。 */
async function writeLedger(base, items) {
  await writeFile(join(base, LEDGER_FILENAME), serializeLedger(items), "utf8");
}

/**
 * 面板上的"改"。
 *
 * - 改措辞 → **取代**：旧的那句一个字节都不动，落成一条新条目，旧的标成 `superseded by`。
 *   想法变了就该留痕，这是账本的第一原则（GLOSSARY：取代）。
 * - 只改标签 → 原地改类型。标签只是给人看的前缀，改了不留历史没有损失。
 *
 * 不是 active 的条目不给改：已经失效的东西改它没有意义，用户多半是点错了。
 */
export async function reviseItem(root, { id, statement, type, date, source = "" } = {}) {
  const base = normalizeRoot(root);
  const config = await readConfig(base);
  const items = await readItems(base);
  const target = items.find((item) => item.id === id);

  if (!target) return { ok: false, reason: `${id} 不在账本里。`, items, config };
  if (!isActive(target)) {
    return { ok: false, reason: `${id} 已经失效（${target.status}），没有可改的东西。`, items, config };
  }

  const nextStatement = statement == null ? null : oneLine(statement);
  const nextType = type == null ? null : resolveType(config, type);

  if (nextStatement && nextStatement !== target.statement) {
    const { created, items: after } = await commitItems(
      base,
      [{ statement: nextStatement, type: nextType ?? target.type, supersedes: id }],
      { date, source: source || `账本面板 · 取代 ${id}` }
    );
    return {
      ok: true,
      action: "superseded",
      item: created[0] ?? null,
      replacedId: id,
      items: after,
      config
    };
  }

  if (nextType && nextType !== target.type) {
    const changed = { ...target, type: nextType };
    const after = items.map((item) => (item.id === id ? changed : item));
    await writeLedger(base, after);
    return { ok: true, action: "relabelled", item: changed, items: after, config };
  }

  return { ok: true, action: "unchanged", item: target, items, config };
}

/** 退休：这条不再生效，没有后继者。同样只对 active 的条目动手。 */
export async function retireItem(root, { id } = {}) {
  const base = normalizeRoot(root);
  const config = await readConfig(base);
  const items = await readItems(base);
  const target = items.find((item) => item.id === id);

  if (!target) return { ok: false, reason: `${id} 不在账本里。`, items, config };
  if (target.status === "retired") {
    return { ok: true, action: "unchanged", item: target, items, config };
  }
  if (!isActive(target)) {
    return { ok: false, reason: `${id} 已经失效（${target.status}）——取代过的条目不用再退休。`, items, config };
  }

  const after = retire(items, id);
  await writeLedger(base, after);
  return { ok: true, action: "retired", item: after.find((item) => item.id === id), items: after, config };
}
