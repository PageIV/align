# 02 — 端到端最薄闭环

Status: resolved
Resolved in: bf18930
Blocked by: 01
Type: task

## 目标

一条能走通的完整路径，哪怕粗：打开面板 → 填一条断言 → 点落地 → 项目层两个文件被正确改写。这个 ticket 建立插件骨架和纯逻辑层的形状，后面的 ticket 都往里填。

## 交付

- 骨架从探针长出来：`.codex-plugin/plugin.json`、`.mcp.json`、`mcp/server.mjs`、`ui/panel.html` 保留，工具从 `probe_open_panel` 长出 `align_review`
- `logic/` 目录，纯逻辑、不 import 任何 MCP 或 Codex 相关模块：
  - 已确认项的数据模型（编号、类型、断言、来源、状态）
  - `ALIGNMENT.md` 的序列化与反序列化
  - `AGENTS.md` 受管区块的生成与更新（`<!-- align:begin -->` … `<!-- align:end -->`）
- 面板：一个输入框 + 一个"落地"按钮，调 `align_commit`

## 验收标准

1. `npm test` 覆盖两件幂等性：同一条目序列化再反序列化再序列化，字节一致；热块写两次，第二次无 diff。
2. `logic/` 里没有任何 `mcp`、`jsonrpc`、`codex` 字样的 import（用一个测试断言这一点，ADR-0001 靠它落地）。
3. 真机操作：打开面板 → 填断言 → 落地 → `ALIGNMENT.md` 出现该条目，`AGENTS.md` 出现受管区块；再点一次不产生重复条目。
4. 热块只装状态为 active 的条目，且不超过 `hot_block_max_items`。

## 边界

不做类型、不做作用域、不做 supersede、不做注入。这一票只求闭环通。

## 上下文指针

- `.scratch/align/spec.md` 的"端到端流程"1–5、"载体"、"数据格式"、"架构"
- `GLOSSARY.md`：已确认项、对齐账本、热块、落地
- `docs/adr/0001-align-codex-first-host-agnostic-core.md`

## 关键约束（已实测）

- 面板资源被宿主缓存：改 `ui/panel.html` 后必须重启 app。
- CSP 域名列表全空：CSS/JS 必须内联。
- 侧边面板约 371px 宽。
