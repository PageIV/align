# 05 — 线程层落地（注入通道）

Status: wontfix
Blocked by: 02, 03
Type: task

## 目标

不写文件的落地路径：用 `ui/update-model-context` 把确认项附着到用户的下一条消息上。

## 交付

- 面板调 `ui/update-model-context`，同时给 `content`（人读的文本）和 `structuredContent`（机器读的结构）
- 面板上的作用域选择，默认线程层
- **风险提示文案必须出现在面板上**：这条只保证你的下一条消息带上；之后靠对话历史，压缩后可能失效。旁边给一个"提升到项目层"的入口（真正实现在 06）

## 验收标准

1. 真机：点线程层落地 → 输入框上方出现"上下文"小框 → 发一条消息 → 主 Agent 能复述该条内容，且用户没在对话里提过它。
2. 不产生任何文件改动（`git status` 干净）。
3. 面板上看得到那条风险提示。
4. 注入内容按不可信输入处理：`logic/` 与面板都把它的内容当数据，任何地方都不执行它。

## 关键约束（已实测，别重新踩）

- `ui/update-model-context` 是**一次性附着**，随用户下一条消息发出即消耗，不是持久上下文。实测：注入 → 发"1"（注入到达）→ 发"2"（什么都没到达）。
- 注入要求面板存活，面板关掉后再注入会得到 `-32000 The widget source is no longer active`。
- 注入到达时标着 `untrusted_input`，来源 `mcp_app`。

## 上下文指针

- `.scratch/align/spec.md` 的"两个杠杆的确切行为"
- `GLOSSARY.md`：落地（线程层）

## 结论（2026-10-05）

不做了。`ui/update-model-context` 是一次性附着，之后靠对话历史承重、压缩即失效——而需求是"每轮都要拿到"，只有落文件能满足。每轮注入改走 `UserPromptSubmit` 钩子（工单 12），理由与实测见那张票和 [docs/discussion.md](../../../docs/discussion.md)。

线程**作用域**本身没废，只是暂缓：钩子拿得到 `session_id`，按线程渲染技术上可行，等有明确问题再做。
