#!/usr/bin/env node
// align — MCP server
//
// 工具面很薄，逻辑全在 logic/。这个文件只做三件事：把工具暴露给模型、把面板资源递给宿主、
// 把结果翻译成人话。任何"对齐"的判断都不该写在这里。

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import { commitItems, readItems } from "../logic/store.mjs";

const APP_MIME = "text/html;profile=mcp-app";

const PANEL_URI = "ui://align/panel.html";
const PROBE_URI = "ui://align/probe.html";

const RESOURCES = new Map([
  [PANEL_URI, { file: new URL("../ui/panel.html", import.meta.url), name: "align panel" }],
  [PROBE_URI, { file: new URL("../ui/probe.html", import.meta.url), name: "align probe panel" }]
]);

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    statement: { type: "string", description: "一句话断言。" },
    type: { type: "string", description: "四类之一的 slug；省略时由插件给默认值。" }
  },
  required: ["statement"],
  additionalProperties: false
};

const TOOLS = [
  {
    name: "align_review",
    title: "打开对齐面板",
    description:
      "把待确认的候选断言交给用户勾选。追问结束后调用它，用户会在面板里逐条选择、给类型、点落地。root 省略时用插件进程的工作目录；主 Agent 应当把当前工作区的绝对路径传进来。",
    inputSchema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          description: "侧聊里确认下来的候选断言。",
          items: CANDIDATE_SCHEMA
        },
        root: { type: "string", description: "项目根目录的绝对路径。" },
        source: { type: "string", description: "这批断言来自哪里，写进账本条目的来源字段。" }
      },
      additionalProperties: false
    },
    _meta: { ui: { resourceUri: PANEL_URI, visibility: ["model", "app"] } }
  },
  {
    name: "align_commit",
    title: "落地到项目层",
    description:
      "把勾选好的断言写进 ALIGNMENT.md，并更新 AGENTS.md 里的受管区块。通常由面板调用；也可以由主 Agent 直接调用。",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "要落地的断言，至少一条。",
          items: CANDIDATE_SCHEMA
        },
        root: { type: "string", description: "项目根目录的绝对路径。" },
        source: { type: "string", description: "来源描述。" }
      },
      required: ["items"],
      additionalProperties: false
    }
  },
  {
    name: "probe_open_panel",
    title: "打开 align 探针面板",
    description:
      "自检工具。打开探针面板，用两个按钮分别测试宿主的 ui/update-model-context 与 ui/message 通道。app 升级后用它复测宿主能力。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    _meta: { ui: { resourceUri: PROBE_URI, visibility: ["model", "app"] } }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

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

async function callTool(name, params) {
  switch (name) {
    case "align_review": {
      const candidates = Array.isArray(params?.candidates) ? params.candidates : [];
      return {
        content: [
          {
            type: "text",
            text: candidates.length
              ? `面板已打开，共 ${candidates.length} 条候选断言。勾选你认可的，选好类型，点落地。`
              : "面板已打开。还没有候选断言——你可以直接在面板里写一条。"
          }
        ],
        structuredContent: {
          kind: "align-review",
          root: resolveRoot(params),
          source: params?.source ?? "",
          candidates
        }
      };
    }

    case "align_commit": {
      assertDrafts(params?.items);
      const root = resolveRoot(params);
      const { created } = await commitItems(root, params.items, {
        date: localDate(),
        source: params?.source ?? localDate()
      });

      const lines = created
        .map((item) => `${item.id} · ${item.type} · ${item.statement}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `已落地 ${created.length} 条到 ${root}：\n${lines}\n\n下面按类型策略决定要不要复述——错误纠正和方向纠偏需要复述，另外两类不用。`
          }
        ],
        structuredContent: { created }
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

    case "probe_open_panel":
      return {
        content: [
          {
            type: "text",
            text: "探针面板已打开。用面板里的按钮测试宿主通道，结果会显示在面板底部。"
          }
        ],
        structuredContent: { probe: "opened" }
      };

    default:
      throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
  }
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case "initialize":
      result(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        serverInfo: { name: "align", version: "0.0.1" }
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

  handle(message).catch((error) => {
    if (message.id !== undefined && message.id !== null) {
      failure(message.id, -32603, `internal error: ${error?.message ?? error}`);
    }
  });
});

// stdin 关闭后不强行退出：resources/read 与写文件都是异步的，
// 抢在它们写回之前 exit 会丢响应。交给事件循环自然结束。
