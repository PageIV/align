# 10 — 探针常驻自检 + ADR-0002

Status: open
Blocked by: 无
Type: task

## 目标

探针那四个文件的验证能力值得留下来——它测的"宿主能力"和"面板存活"恰恰是最容易随 app 升级悄悄变化的东西。同时把那两个通道的选择正式记成决策。

## 交付

- 探针工具保留（继续叫 `probe_open_panel`），在 README 里写清"app 升级后怎么用它复测"
- `docs/adr/0002-*.md`：**要重写**。原本写"为什么线程层用 `ui/update-model-context`"，那条路已作废（工单 05）。改成记真正的载体决策：为什么每轮注入走 `UserPromptSubmit` 钩子而不是 `AGENTS.md` 受管区块，附实测证据（`AGENTS.md` 只有重启才重读、钩子的信任门、注入形态）。工单 12 的 Comments 和 [docs/discussion.md](../../../docs/discussion.md) 是素材

## 验收标准

1. 按 README 的步骤走一遍，能独立复测出宿主是否仍然支持两个通道。
2. ADR-0002 记录了实测证据，而不是只写结论。
3. 探针代码与正式插件代码有明确的边界（探针不参与正式路径）。

## 上下文指针

- `.scratch/align/spec.md` 的"已验证的技术前提"
- `docs/adr/0001-align-codex-first-host-agnostic-core.md`
