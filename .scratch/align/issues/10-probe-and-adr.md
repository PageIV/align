# 10 — 探针常驻自检 + ADR-0002

Status: resolved
Blocked by: 无
Type: task

## 目标

探针的验证能力值得留下来——它测的"宿主能力"和"面板存活"恰恰是最容易随 app 升级悄悄变化的东西。同时把每轮注入那条通道的选择正式记成决策。

**2026-10-07 改向**：探针面收窄到只剩 `probe_elicit`。原来的 `probe_open_panel` + `ui/probe.html`（测 `ui/update-model-context` 与 `ui/message`）连同 `hooks/probe-inject.mjs` 已删——它们测的三样东西都没有调用者了：线程层作废、复述改走收件箱、"钩子在不在跑"由注入末尾那行 `<!-- align:inject … -->` 本身证明。所以本票不再要求"保留 `probe_open_panel`"。

## 交付

- 常驻探针只剩 `probe_elicit`（`mcp/server.mjs`），README 的§探针写清"app 升级后怎么用它复测"，并说明"要复测面板就直接调 `align_open_ledger`"
- `docs/adr/0002-per-turn-injection-via-user-prompt-hook.md`：记每轮注入的通道选择——为什么走 `UserPromptSubmit` 钩子而不是 `AGENTS.md` 受管区块，附实测证据（`AGENTS.md` 只有重启才重读、钩子的信任门、注入形态）。工单 11–13 的 Comments 与 [docs/discussion.md](../../discussion.md) 是素材

## 验收标准

1. 按 README 的步骤走一遍，能独立复测出宿主是否仍然渲染落地表单；面板则用 `align_open_ledger` 复测。
2. ADR-0002 记录了实测证据，而不是只写结论。
3. 探针不参与正式路径：`probe_elicit` 不写任何文件，落地只有 `align_land` 一条路（C-007）。

## 上下文指针

- `.scratch/align/spec.md` 的"已验证的技术前提"
- `docs/adr/0001-align-codex-first-host-agnostic-core.md`、`docs/adr/0002-per-turn-injection-via-user-prompt-hook.md`

## Answer

2026-10-07 收口。两条交付都到位，且都不需要真机（纯文档 + 已经删干净的探针面）：

- **常驻探针＝`probe_elicit` 一个。** README 的§探针已写明它的用途与"app 升级后复测"的路子，并写清另外两个探针被删的理由、以及"复测面板直接调 `align_open_ledger`"。验收标准 1、3 成立。
- **ADR-0002 写成** `docs/adr/0002-per-turn-injection-via-user-prompt-hook.md`：背景（受管区块只在重启时读一次）、决定（`UserPromptSubmit` 钩子现渲染）、考虑过的替代方案（受管区块 / 两者并存 / 每轮显式调 `align_list`）、后果（信任门、子代理拿不到、线程作用域重新可实现）、证据指针（工单 11–13）。验收标准 2 成立。
