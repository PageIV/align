# 03 — 类型策略

Status: open
Blocked by: 02
Type: task

## 目标

让四种类型成为一等字段，并且把"类型 → 行为"做成配置而不是代码分支。增删类型只改 `.align/config.toml`。

## 交付

- `.align/config.toml` 的读取与解析（`hot_block_max_items`、每类的 `restate`）
- 默认值：`concept-alignment` / `detail-completion` 为 `restate = false`，`error-correction` / `direction-correction` 为 `restate = true`
- **配置里没声明的新类型默认 `restate = false`**（静默是唯一安全的默认）
- 面板：每条候选断言带一个类型选择，默认给一个建议类型
- `restate = true` 的条目落地后，面板发一条 `ui/message` 可见卡片，触发主 Agent 复述

## 验收标准

1. 往 `.align/config.toml` 加第五类 `foo`（不写 `restate`）→ 重启后面板出现该类型，且行为是静默；**不改任何代码**。
2. 把 `concept-alignment` 的 `restate` 改成 `true` → 该类型落地后主 Agent 会复述。
3. 代码里搜不到把四个 slug 写死的条件分支（只允许出现在默认值表里）。

## 边界

静默类型的落地依赖注入通道，那一半在 05。这一票只保证 `restate = true` 的路径完整。

## 上下文指针

- `.scratch/align/spec.md` 的"数据格式"（类型策略）与流程第 6 步
- `GLOSSARY.md`：四种类型、类型策略

