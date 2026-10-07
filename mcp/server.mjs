#!/usr/bin/env node
// align — MCP server
//
// 工具面很薄，逻辑全在 logic/。这个文件只做三件事：把工具暴露给模型、把面板资源递给宿主、
// 把结果翻译成人话。任何"对齐"的判断都不该写在这里。

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import { listTypes, resolveType, suggestedType } from "../logic/config.mjs";
import {
  DESTINATIONS,
  destinationLabel,
  destinationSlug,
  suggestionSlug
} from "../logic/destination.mjs";
import {
  addRestatements,
  commitItems,
  readConfig,
  readItems,
  readSessionMarker,
  retireItem,
  reviseItem
} from "../logic/store.mjs";
import { isActive } from "../logic/item.mjs";

const APP_MIME = "text/html;profile=mcp-app";

const PANEL_URI = "ui://align/panel.html";

const RESOURCES = new Map([
  [PANEL_URI, { file: new URL("../ui/panel.html", import.meta.url), name: "align panel" }]
]);

const STATEMENT_SCHEMA = {
  type: "object",
  properties: {
    statement: {
      type: "string",
      description: "一句话断言。选「复述」时，这段文本就是被带回主线的那段，尽量照抄原话。"
    },
    type: {
      type: "string",
      description: "分类标签，只影响账本与热块里的行首前缀；写 slug 或中文都认，省略时用配置里的第一个。"
    },
    supersedes: {
      type: "string",
      description:
        "这条断言取代哪个已确认项（写 C-0NN）。用于用户说「那条不对了/过时了，应该是 X」的场合：旧条目会被标成 superseded，保留在账本的历史里，不再每轮注入。省略就是新增一条，不碰任何旧条目。"
    }
  },
  required: ["statement"],
  additionalProperties: false
};

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    ...STATEMENT_SCHEMA.properties,
    destination: {
      type: "string",
      enum: DESTINATIONS.map((entry) => entry.slug),
      description:
        "你建议这条去哪，每条都要给。表单会默认停在这一项，用户随时改。land=写进账本、以后每轮都带上；restate=只在主线下一次提问里带上一次（命令式的、用完就失效的内容，或够不上一条已确认项的片段，用这个）；ignore=不留痕（不值得留、但值得让用户看一眼的，用这个）。"
    }
  },
  required: ["statement"],
  additionalProperties: false
};

const TOOLS = [
  {
    name: "align_commit",
    title: "落地到项目层",
    description:
      "把断言直接写进 ALIGNMENT.md，不弹表单。只在用户明确说「别弹表单，直接写进去」时用——正常落地统一走 align_land 的原生表单（C-007）。",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "要落地的断言，至少一条。",
          items: STATEMENT_SCHEMA
        },
        root: { type: "string", description: "项目根目录的绝对路径。" },
        source: { type: "string", description: "来源描述。" }
      },
      required: ["items"],
      additionalProperties: false
    }
  },
  {
    name: "align_land",
    title: "落地（原生表单）",
    description:
      "把候选断言交给用户，用宿主原生的 elicitation 表单逐条选去哪：「Align」写进 ALIGNMENT.md 以后每轮带上、「Restate」只带回主线说一次、「Ignore」不留痕。表单默认停在你在每条候选上给的 destination 建议上；用户整张表单都不想决定时按 skip，账本不动。主线程和侧聊都能用——在侧聊里用它，就是把结论搬回主线的正路。root 省略时用插件进程的工作目录，主 Agent 应当把当前工作区的绝对路径传进来。",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          description: "待用户逐条确认的候选断言。",
          items: CANDIDATE_SCHEMA
        },
        root: { type: "string", description: "项目根目录的绝对路径。" },
        source: { type: "string", description: "这批断言来自哪里，写进账本条目的来源字段。" }
      },
      required: ["candidates"],
      additionalProperties: false
    }
  },
  {
    name: "align_list",
    title: "看当前对齐了什么",
    description: "读回账本，列出当前生效与已失效的已确认项。",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "项目根目录的绝对路径。" }
      },
      additionalProperties: false
    }
  },
  {
    name: "align_open_ledger",
    title: "打开对齐账本",
    description:
      "打开账本面板：列出当前生效与已失效的已确认项，可以改标签、取代（改措辞）、退休。用户说「看看对齐了什么」「把某条改掉」时用它；只想知道内容、不想开面板就用 align_list。落地仍然只走 align_land 的原生表单（C-007），这个面板不落地。",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "项目根目录的绝对路径。" }
      },
      additionalProperties: false
    },
    _meta: { ui: { resourceUri: PANEL_URI, visibility: ["model", "app"] } }
  },
  {
    name: "align_edit",
    title: "改一条已确认项",
    description:
      "改一条已确认项，给账本面板用，也可以直接由主 Agent 调用。改措辞会走取代（旧的保留、标成失效，历史不丢）；只改标签是原地改；retire 是退休（不再生效，也没有后继者）。只对当前生效的条目不生效的会报错。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "要改的已确认项编号，例如 C-013。" },
        statement: { type: "string", description: "新的措辞。与旧的不同就会落成一条新条目并取代旧的。" },
        type: { type: "string", description: "新的标签。只改标签时原地改，不留历史。" },
        retire: { type: "boolean", description: "true = 退休这条（不再每轮注入）。与 statement 不要同时给。" },
        root: { type: "string", description: "项目根目录的绝对路径。" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "probe_elicit",
    title: "试 elicitation 原生表单",
    description:
      "自检工具。由插件 server 向宿主发一张 elicitation 表单，测三件事：宿主是否渲染原生表单、在侧聊里是否照样渲染、以及没有 turn 的调用（面板按钮）和有 turn 的调用（模型调用）差在哪。不写任何文件。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

// server→host 请求。MCP 是双向的：我们在处理 tools/call 的时候可以向宿主发一条请求
// （例如 elicitation/create），宿主渲染界面，用户的选择按 id 回到这里。
// 探针用；正式路径暂不依赖它。
const PENDING = new Map();
let serverRequestSeq = 0;

// 等用户填表的超时。它必须**短于** `.mcp.json` 的 `tool_timeout_sec`（现在是 600），
// 否则宿主先掐断工具调用，我们连自己超时的机会都没有。
// 别往小里调：45 秒实测不够一个人填完四栏。
const HOST_REQUEST_TIMEOUT_MS = 480_000;

function requestHost(method, params, { timeoutMs = HOST_REQUEST_TIMEOUT_MS } = {}) {
  const id = `align-${++serverRequestSeq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (PENDING.delete(id)) {
        reject(new Error(`宿主在 ${Math.round(timeoutMs / 1000)}s 内没有回应 ${method}`));
      }
    }, timeoutMs);
    PENDING.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

// 宿主在 initialize 里自报的 client capabilities。探针把它原样带出来，
// "宿主到底宣不宣称支持 elicitation" 是个需要看原始值、不能靠推断的问题。
let hostCapabilities = null;

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function failure(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function resolveRoot(params) {
  const root = params?.root ?? process.env.CODEX_WORKSPACE_ROOT ?? process.cwd();
  return String(root);
}

function assertDrafts(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("至少需要一条断言"), { code: -32602 });
  }
  for (const item of items) {
    if (typeof item?.statement !== "string" || item.statement.trim() === "") {
      throw Object.assign(new Error("每条断言都需要非空的 statement"), { code: -32602 });
    }
  }
}

function typeLabel(types, slug) {
  return types.find((entry) => entry.slug === slug)?.label ?? slug;
}

/** 取代与警告这两段在 align_commit / align_land 里都要出，写一次。 */
function linkLines({ replaced = [], warnings = [] }) {
  const lines = [];

  if (replaced.length > 0) {
    lines.push(`取代：${replaced.map((entry) => `${entry.from} → ${entry.to}`).join("、")}。旧条目没删，标成失效留在账本里。`);
  }
  if (warnings.length > 0) {
    lines.push(`注意：\n${warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }

  return lines;
}

/** 面板要的东西：账本原文 + 当前类型表。改完之后也回这一份，面板照着重渲染。 */
async function ledgerState(root) {
  const config = await readConfig(root);
  const items = await readItems(root);
  const active = items.filter(isActive).length;
  return { root, items, types: listTypes(config), active, total: items.length };
}

function describeEdit(result, types = []) {
  const label = (slug) => types.find((entry) => entry.slug === slug)?.label ?? slug;

  switch (result.action) {
    case "superseded":
      return `${result.item.id} 已经落地，${result.replacedId} 标成失效——旧措辞留在账本的历史里。`;
    case "relabelled":
      return `${result.item.id} 的标签改成「${label(result.item.type)}」。`;
    case "retired":
      return `${result.item.id} 退休：不再每轮注入，条目留在账本里。`;
    default:
      return "没有变化。";
  }
}

async function callTool(name, params) {
  switch (name) {
    case "align_commit": {
      assertDrafts(params?.items);
      const root = resolveRoot(params);
      const { created, replaced, warnings } = await commitItems(root, params.items, {
        date: localDate(),
        source: params?.source ?? localDate()
      });

      const text = [
        `已落地 ${created.length} 条到 ${root}：\n${created
          .map((item) => `${item.id} · ${item.type} · ${item.statement}`)
          .join("\n")}`,
        ...linkLines({ replaced, warnings })
      ].join("\n\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: { created, replaced, warnings }
      };
    }

    case "align_list": {
      const items = await readItems(resolveRoot(params));
      return {
        content: [
          {
            type: "text",
            text: items.length
              ? items
                  .map((item) => `${item.id} · ${item.type} · ${item.status}：${item.statement}`)
                  .join("\n")
              : "账本还是空的。"
          }
        ],
        structuredContent: { items }
      };
    }

    case "align_open_ledger": {
      const state = await ledgerState(resolveRoot(params));
      return {
        content: [
          {
            type: "text",
            text: `账本已打开：${state.active} 条生效、${state.total - state.active} 条已失效。面板里可以改标签、取代、退休；落地仍然走 align_land 的表单。`
          }
        ],
        structuredContent: state
      };
    }

    case "align_edit": {
      const root = resolveRoot(params);
      const id = String(params?.id ?? "").trim();

      if (!id) {
        throw Object.assign(new Error("要改哪一条？id 不能为空（例如 C-013）"), { code: -32602 });
      }

      const result =
        params?.retire === true
          ? await retireItem(root, { id })
          : await reviseItem(root, {
              id,
              statement: params?.statement,
              type: params?.type,
              date: localDate(),
              source: `账本面板 · 取代 ${id}`
            });

      const state = await ledgerState(root);
      const message = result.ok ? describeEdit(result, state.types) : `没改动：${result.reason}`;

      return {
        content: [{ type: "text", text: message }],
        structuredContent: {
          ...state,
          ok: result.ok,
          action: result.action ?? null,
          message
        }
      };
    }

    case "align_land": {
      const root = resolveRoot(params);
      const candidates = Array.isArray(params?.candidates) ? params.candidates : [];

      if (candidates.length === 0) {
        return {
          content: [{ type: "text", text: "没有候选断言，什么都没做。" }],
          structuredContent: { created: [] }
        };
      }

      const config = await readConfig(root);
      const types = listTypes(config);
      const fallbackType = suggestedType(config);

      // 用户唯一要判断的事是"这段东西去哪"。分类不让用户选——类型退化成标签，由模型在
      // 背后给（工单 15）。表单默认停在模型给的建议上，用户随时改。
      //
      // 三个选项：Align / Restate / Ignore。Ignore 是逐条丢弃；表单自带的 skip 按钮是
      // 另一回事——整张表单都不想决定。一条候选一次只问一遍。
      //
      // **宿主不会预选。** elicitation 表单初始化状态时直接跳过选择型字段
      // （app 里那个 `if (vXn(schema)) continue;`——string + enum/oneOf/anyOf 都算），
      // default 只对文本、布尔、数字生效。这是故意不给"默认"的：选择型字段不该被静默接受。
      // 所以建议只能落在三处：枚举顺序（建议排第一，开下拉直接回车就是它）、条目的描述文字
      // （「建议 Restate」）、以及提交时对空值的处理（按建议走，见下面循环）。
      //
      // elicitation 的 schema 只有扁平属性表，没有嵌套列表，所以一条候选占一个属性。
      const properties = {};
      const slots = candidates.map((candidate, index) => {
        const key = `c${index + 1}`;
        const suggestion = suggestionSlug(candidate.destination);
        const type = resolveType(config, candidate.type ?? fallbackType);
        const suggestedLabel = destinationLabel(suggestion);

        properties[key] = {
          type: "string",
          title: candidate.statement,
          description: `第 ${index + 1} 条 · 建议${suggestedLabel} · 标签 ${typeLabel(types, type)}`,
          // 建议的那一项放最前面，同时也写进 default：宿主若不认 default，枚举的第一项
          // 就是落点，效果一样。用户不改就是同意这个建议。
          enum: [suggestedLabel, ...DESTINATIONS.map((entry) => entry.label).filter((label) => label !== suggestedLabel)],
          default: suggestedLabel
        };
        return { key, candidate, suggestion, type };
      });

      const menu = DESTINATIONS.map((entry) => `${entry.label} = ${entry.hint}`).join("\n");

      let response;
      try {
        response = await requestHost("elicitation/create", {
          mode: "form",
          message: `align：逐条选去哪，共 ${candidates.length} 条。\n${menu}\n每条的描述里写着它自己的建议；没动过的那条就按建议处理。整张表单都不想决定就按 skip，账本不会动。`,
          requestedSchema: { type: "object", properties, required: [] }
        });
      } catch (error) {
        const message = String(error?.message ?? error);
        return {
          content: [{ type: "text", text: `没拿到表单结果：${message}。账本未改动。` }],
          structuredContent: { created: [], error: message }
        };
      }

      if (response?.action !== "accept") {
        const action = response?.action ?? null;
        return {
          content: [
            {
              type: "text",
              text: action === "decline" ? "用户跳过了表单，账本未改动。" : "表单被关掉了，账本未改动。"
            }
          ],
          structuredContent: { created: [], action }
        };
      }

      const content = response?.content ?? {};
      const chosen = [];
      const restatements = [];

      for (const { key, candidate, suggestion, type } of slots) {
        // 空值按建议处理。宿主不预选选择型字段（见上面的说明），所以"没动过"在回传里就是
        // 缺这个 key——表单顶部那句"没动过的那条按它的建议处理"把这件事讲明白了，
        // 用户不改就是同意模型的建议。
        const raw = content[key];
        const picked = typeof raw === "string" && raw.trim() ? raw.trim() : destinationLabel(suggestion);
        const destination = destinationSlug(picked);

        if (destination === "land") {
          chosen.push({
            statement: candidate.statement,
            type,
            supersedes: typeof candidate.supersedes === "string" ? candidate.supersedes.trim() : ""
          });
        }
        else if (destination === "restate") restatements.push(candidate.statement);
      }

      if (chosen.length === 0 && restatements.length === 0) {
        return {
          content: [{ type: "text", text: "没有任何一条被选中，账本未改动。" }],
          structuredContent: { created: [] }
        };
      }

      let created = [];
      let replaced = [];
      let warnings = [];
      if (chosen.length > 0) {
        ({ created, replaced, warnings } = await commitItems(root, chosen, {
          date: localDate(),
          source: params?.source ?? localDate()
        }));
      }

      // 复述去哪，取决于"这轮是在主线程还是侧聊里"。工具调用里没有会话信息，
      // 所以读钩子在这次提问时留下的标记。认不出来（钩子没跑过、或是全新项目）就按
      // 侧聊处理——写进收件箱最坏是晚一轮到；当成主线程当场说出来，则可能随侧聊一起消失。
      const marker = await readSessionMarker(root).catch(() => null);
      const inMainThread = Boolean(marker) && marker.side !== true;

      const inline = inMainThread ? restatements : [];
      let inboxed = [];

      if (restatements.length > 0 && !inMainThread) {
        try {
          inboxed = await addRestatements(root, restatements, {
            at: new Date().toISOString(),
            session: marker?.session_id ?? ""
          });
        } catch {
          // 收件箱写不动，就退回当场说出来——写在回复里总比丢掉强。
          inline.push(...restatements);
        }
      }

      const sections = [];
      if (created.length > 0) {
        sections.push(
          `已落地 ${created.length} 条到 ${root}：\n${created
            .map((item) => `${item.id} · ${item.type} · ${item.statement}`)
            .join("\n")}`
        );
      }
      sections.push(...linkLines({ replaced, warnings }));
      if (inline.length > 0) {
        sections.push(
          `需要你**在这一轮回复里原样说出来**的复述（没写任何文件，别改写成结论）：\n${inline
            .map((text) => `- ${text}`)
            .join("\n")}`
        );
      }
      if (inboxed.length > 0) {
        sections.push(
          `已放进收件箱 ${inboxed.length} 条，会在主线的下一次提问时自动带上（你现在不用复述）：\n${inboxed
            .map((entry) => `- ${entry.text}`)
            .join("\n")}`
        );
      }

      return {
        content: [{ type: "text", text: sections.join("\n\n") }],
        structuredContent: { created, replaced, warnings, inline, inboxed }
      };
    }

    case "probe_elicit": {
      const marker = `ALIGN_PROBE_ELICIT_${Date.now()}`;

      // 表单故意混三种控件：boolean 是勾选框，array+enum 是多选，string+enum 是单选，
      // 再加一个自由文本。这样一次就能看出宿主到底渲染了哪几类，而不只是"弹了个框"。
      const requestedSchema = {
        type: "object",
        properties: {
          rendered: {
            type: "boolean",
            title: "这张表单渲染出来了",
            description: `看到它就勾上（探针标记 ${marker}）`
          },
          picked: {
            type: "array",
            title: "多选：想落地的条目",
            description: "任选几项，验多选控件",
            items: { type: "string", enum: ["C-901", "C-902", "C-903"] }
          },
          choice: {
            type: "string",
            title: "单选：落地 UI 用哪个",
            enum: ["用原生表单", "继续用面板", "都行"]
          },
          note: {
            type: "string",
            title: "自由文本",
            description: "随便写一句，验文本控件"
          }
        },
        required: ["rendered"]
      };

      let outcome;
      try {
        const response = await requestHost("elicitation/create", {
          mode: "form",
          message: `align 探针 ${marker}：这张表单由插件 server 发起，不是模型工具。提交后选择会回到插件。`,
          requestedSchema
        });
        outcome = { ok: true, marker, action: response?.action ?? null, content: response?.content ?? null };
      } catch (error) {
        outcome = { ok: false, marker, error: String(error?.message ?? error) };
      }

      const caps = hostCapabilities ? JSON.stringify(hostCapabilities) : "（initialize 没有自报 capabilities）";
      const summary = outcome.ok
        ? `探针 ${marker} 成功。宿主返回 action=${outcome.action}，content=${JSON.stringify(outcome.content)}`
        : `探针 ${marker} 失败：${outcome.error}`;

      return {
        content: [{ type: "text", text: `${summary}\n宿主自报的 client capabilities：${caps}` }],
        structuredContent: { ...outcome, hostCapabilities }
      };
    }

    default:
      throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
  }
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case "initialize":
      hostCapabilities = params?.capabilities ?? null;
      result(id, {
        protocolVersion: params?.protocolVersion ?? "2026-01-26",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        serverInfo: { name: "align", version: "0.2.12" }
      });
      return;

    case "notifications/initialized":
      return;

    case "tools/list":
      result(id, { tools: TOOLS });
      return;

    case "tools/call": {
      try {
        result(id, await callTool(params?.name, params?.arguments ?? {}));
      } catch (error) {
        failure(id, error?.code ?? -32603, String(error?.message ?? error));
      }
      return;
    }

    case "resources/list":
      result(id, {
        resources: [...RESOURCES].map(([uri, entry]) => ({
          uri,
          name: entry.name,
          mimeType: APP_MIME
        }))
      });
      return;

    case "resources/read": {
      const uri = String(params?.uri ?? "");
      const entry = RESOURCES.get(uri);
      if (!entry) {
        failure(id, -32602, `unknown resource: ${uri}`);
        return;
      }
      // 每次从磁盘读：宿主会缓存面板资源，但如果它来问，我们至少给最新的。
      result(id, {
        contents: [{ uri, mimeType: APP_MIME, text: await readFile(entry.file, "utf8") }]
      });
      return;
    }

    case "ping":
      result(id, {});
      return;

    default:
      if (isRequest) failure(id, -32601, `method not found: ${method}`);
  }
}

const input = createInterface({ input: process.stdin, terminal: false });

input.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }

  // 没有 method 的是应答（对我们 server→host 请求的回复），不是新请求：不走 handle()。
  // 认不出来的 id 直接丢掉——回一个 "method not found" 给它只会污染日志。
  if (message.method === undefined) {
    const entry = PENDING.get(message.id);
    if (!entry) return;
    PENDING.delete(message.id);
    if (message.error) {
      entry.reject(
        Object.assign(new Error(message.error.message ?? "宿主请求失败"), {
          code: message.error.code
        })
      );
    } else {
      entry.resolve(message.result);
    }
    return;
  }

  handle(message).catch((error) => {
    if (message.id !== undefined && message.id !== null) {
      failure(message.id, -32603, `internal error: ${error?.message ?? error}`);
    }
  });
});

// stdin 关闭后不强行退出：resources/read 与写文件都是异步的，
// 抢在它们写回之前 exit 会丢响应。交给事件循环自然结束。
