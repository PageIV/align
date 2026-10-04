# 10 — 探针常驻自检 + ADR-0002

Status: open
Blocked by: 无
Type: task

## 目标

探针那四个文件的验证能力值得留下来——它测的"宿主能力"和"面板存活"恰恰是最容易随 app 升级悄悄变化的东西。同时把那两个通道的选择正式记成决策。

## 交付

- 探针工具保留（继续叫 `probe_open_panel`），在 README 里写清"app 升级后怎么用它复测"
- `docs/adr/0002-mcp-apps-two-channels.md`：为什么线程层用 `ui/update-model-context`、复述用 `ui/message`，以及支撑它的实测证据（能力表、一次性附着的实测序列、`-32000` 门控）

## 验收标准

1. 按 README 的步骤走一遍，能独立复测出宿主是否仍然支持两个通道。
2. ADR-0002 记录了实测证据，而不是只写结论。
3. 探针代码与正式插件代码有明确的边界（探针不参与正式路径）。

## 上下文指针

- `.scratch/align/spec.md` 的"已验证的技术前提"
- `docs/adr/0001-align-codex-first-host-agnostic-core.md`

