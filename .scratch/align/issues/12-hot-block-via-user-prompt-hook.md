# 12 — 热块改走 UserPromptSubmit 钩子

Status: resolved
Blocked by: 11（已给出结论：`AGENTS.md` 不是每轮重读）
Type: task

## 背景

工单 11 实测：侧聊落地 C-005 后，同一线程的主 Agent 凭上下文只能说出生效项到 C-004。`AGENTS.md` 的受注块在会话开始时读一次，**不是每轮重读**。同一实验里技能清单在相邻两轮从 `0.0.7` 刷成 `0.0.8`，说明"每轮重注入"的机制确实在跑，只是不覆盖 `AGENTS.md`。

## 发现：宿主有一套 hooks，其中一条正好是每轮

`ChatGPT.app` 的 CLI 核里有一整套生命周期钩子。事件名（`HookHandlerConfig` 的 tag）：

```
PreToolUse  PermissionRequest  PostToolUse  PreCompact  PostCompact
SessionStart  SessionEnd  UserPromptSubmit  SubagentStart  SubagentStop  Stop  Interrupt
```

`UserPromptSubmit` 的输出 wire（从核里逐字抄出）：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "string"
  }
}
```

这是**每轮**的上下文注入通道，和外层 `continue` / `decision` / `reason` 并列。核里有配套的 `HookPromptItem` / `HookPromptFragment { text, provenance }`，说明钩子输出会变成一条 prompt item，而不只是日志。

另外两条关键事实：插件可以带钩子（app 的插件详情页有 `plugins.detail.includes.hooks.title` / `trustAll` / `review`；核里出现 `hooks/hooks.json` 与 `plugins_disabled`，即插件钩子路径是 `<plugin>/hooks/hooks.json`）；钩子要过信任审核（设置页文案 "1 hook needs review before it can run."，信任状态 `untrusted | trusted | modified`）。

## 为什么这比 AGENTS.md 受注块好

- 生效时机：会话开始读一次 → 每次用户提交消息
- 侧聊落地后主线程能否立刻看到：实测不行 → 应该可以（待验）
- 压缩之后：未知 → `PostCompact` 还能再补一刀
- 体积：整个文件进上下文 → `additionalContextLimit` 可控

`PostCompact` 顺手解掉了 C-002 埋的那个隐患（"压缩即失效"）。

## 要验的

1. 桌面版到底跑不跑插件钩子。核的特性列表里有 `plugin_hooks` 开关，默认值未知；信任审核也可能拦住。
2. `additionalContext` 真的进模型上下文吗，以什么身份进。核里钩子相关的字样里出现过 `untrusted`——如果注入内容被标成"证据"而不是"指令"，"与旧对话冲突时以此为准"这条语义就落不了地，热块的写法要跟着改。
3. `additionalContextLimit` 的默认值与超限行为（截断还是丢弃）。
4. 侧聊里跑不跑（`UserPromptSubmit` 在侧聊那条临时对话里是否触发）。

## 交付

插件里加 `hooks/hooks.json` 加一个探针脚本：每次 `UserPromptSubmit` 注入一个带时间戳的标记，不改任何文件。四条实测结论写进 `## Answer`。

## 验收标准

1. 主线程连续两轮各注入一个不同的标记，主 Agent 都能凭上下文说出当轮标记。
2. 侧聊里落地一条后，主线程**下一轮**能凭上下文说出它——这是整个产品形态的关键一步。
3. 注入内容在上下文里的信任身份有明确结论（指令还是证据），并据此定了热块的措辞。
4. 不成立时的退路写清楚：退回"新会话才生效"，或者主线程每轮显式调 `align_list`。

## 上下文指针

- 工单 11 的 Comments（实测序列与能力自报）
- 核内 JSON schema：`UserPromptSubmitHookSpecificOutputWire`、`PostToolUseHookSpecificOutputWire`、`HookHandlerConfig`
- `ChatGPT.app` 设置页文案：`plugins.detail.includes.hooks.*`
- `.scratch/align/spec.md` 的"载体"表（要改的就是那一行）

## Comments

- 2026-10-05 · 探针写好，等真机。`hooks/hooks.json` 声明一个 `UserPromptSubmit` 命令钩子，命令是 `/opt/homebrew/bin/node "${PLUGIN_ROOT}/hooks/probe-inject.mjs"`；脚本读 stdin 的 JSON，往 stdout 打 `hookSpecificOutput.additionalContext`，带一个 `ALIGN_HOOK_MARKER_<epoch_ms>`，同时往 `/tmp/align-probe-hook.log` 追一行（含 session / turn / cwd）。本地跑通了：喂一条假输入，输出与日志都对，`npm test` 38/38。
- 2026-10-05 · 设计成"日志 + 标记"两条腿，是为了排除自证：模型报出的标记必须能和日志里那一行逐字对上，否则不能算数。
- 2026-10-05 · 还没敢动 `plugin.json`：钩子文件放在核里写死的 `hooks/hooks.json`，先试自动发现。如果没生效，再考虑清单里显式声明 `hooks` 字段。另外钩子多半是 `untrusted`，要在设置里的 Hooks 页过一次信任审核。
- 2026-10-05 · **真机跑通了，而且不用在 `plugin.json` 里声明。** 版本 0.0.9，重启后用户发一条 `1`，钩子注入的 `additionalContext` 逐字出现在这一轮的上下文里，日志也逐字对上：

  ```
  2026-10-05T04:29:14.214Z  ALIGN_HOOK_MARKER_1791174554213
  session=01a10a1a-714c-7b01-abc0-604b7d37a48a
  turn=01a10a52-b1b0-70f2-8d4a-0441e949d38c
  event=UserPromptSubmit  cwd=/Users/page/Documents/Work/pugins
  ```

  三件事同时定了：插件钩子会被加载并执行；`hooks/hooks.json` 在插件根下自动发现，清单不用加字段；`additionalContext` 真的进模型上下文，不是只写日志。信任审核这一关没遇到阻碍（至少这个构建没拦）。

  注入的形态值得记：它不是单独一条消息，而是**贴在用户那条消息后面**。也就是说它拿的是用户级内容的位置。对"冲突时以此为准"是好事（权威足够），但它同时意味着**插件钩子是一条能把文字伪装成用户口吻的通道**——这正是钩子要过信任审核的原因。

- 2026-10-05 · 顺带白捡一条：钩子输入里的 `session_id` 就是**线程 ID**（`01a10a1a-…` 与本工作区的路径段一致）。MCP server 那边拿不到线程身份的问题（见上一轮的讨论）在这里有解了——线程层的文件作用域第一次变得可实现。
- 2026-10-05 · 同一轮还观察到 `AGENTS.md` 的修正：这份受注块在本轮重新注入了一次，带上了 C-005，并附了一句 "These AGENTS.md instructions replace all previously provided AGENTS.md instructions."。也就是说 `AGENTS.md` **会**重读，但触发点是 app 重启 / 线程重载，不是每轮——与工单 11 的结论一致，只是把"什么时候会读到"补全了。
- 2026-10-05 · 还欠：连发第二条确认标记每轮都换；侧聊里触不触发 `UserPromptSubmit`。
- 2026-10-05 · **验收标准 1 通过。** 连发两条，日志两行、两个不同的 `turn`（`01a10a52-…`、`01a10a53-…`）、两个不同的标记，模型两次都逐字报对。每轮注入成立，不是"开机注了一次"。

## Answer

钩子是可行的载具，而且比 `AGENTS.md` 严格更强。

**已验证**

1. 插件钩子被加载执行，`hooks/hooks.json` 自动发现，`plugin.json` 不用加字段。
2. `UserPromptSubmit` 的 `additionalContext` 真的进模型上下文，**每轮**一次，标记逐字可核。
3. 注入形态是贴在用户那条消息后面，拿的是用户级位置。
4. 钩子输入里带 `session_id`（= 线程 ID）与 `turn_id`，线程身份问题一并解决。

**关键性质**：钩子在**用户提交消息的那一刻**运行。所以它在那一刻去读 `ALIGNMENT.md`，读到的必然是当时最新的内容——侧聊刚落的、面板刚改的、手改的，只要在下一次提问之前落盘，就一定会被带上。这正是工单 11 证明 `AGENTS.md` 做不到的事。

**由此确定的产品形态**

- `ALIGNMENT.md` 仍是唯一事实来源（人可读、可 diff、可进 PR）。
- 热块不再由"写进 AGENTS.md"产生，而是**每次提问时由钩子从账本现渲染**并注入。
- `AGENTS.md` 里的受注块降级为"新会话/重启时的保底"，或者直接退役——两者并存会重复注入，需要选一个。
- 线程层（作用域选择）重新变得可实现：钩子有 `session_id`，可以按线程渲染。

**还欠**

- 侧聊里触不触发 `UserPromptSubmit`（不影响主链路，因为落地在侧聊、注入在主线程，是两件事；但它决定侧聊那一轮是否也带账本）。
- `additionalContextLimit` 的默认值与超限行为。
- 钩子报错或超时时会不会挡住用户的提问（默认 timeout 未知）。
- 2026-10-05 · **真钩子写好，版本 0.1.0。** `hooks/inject-hot-block.mjs` 注册在 `UserPromptSubmit`，读 stdin 的 `cwd` 当项目根，调 `logic/store.mjs` 的 `readItems` / `readConfig` 与 `logic/hot-block.mjs` 的 `renderHotBlock`，输出 `hookSpecificOutput.additionalContext`。边界守住了 ADR-0001：解析、渲染、上限全在 `logic/`，钩子只是薄适配层。

  行为定死三条：没有账本的项目 / 没有生效项的账本 / 任何异常，都静默退出（退出码 0，不吐半截输出）——钩子绝不能挡住用户的提问。

  注入末尾带一行 `<!-- align:inject at=<ISO> items=<n> -->`。这是给验证用的：`AGENTS.md` 的受注块里没有这行，所以它在上下文里出现就只可能来自钩子，不用再靠撒标记。

  `hooks/probe-inject.mjs` 保留在仓库里以备 app 升级后复测，但**已从 `hooks.json` 摘掉**——两个注入器同时挂着会重复。

  只挂 `UserPromptSubmit` 一个事件，没有按之前的设想挂 `SessionStart`：每个新会话的第一轮本来就是用户提问，`SessionStart` 带不来额外覆盖，却会引入"同一轮注入两遍"的去重问题。`SubagentStart` 同理暂缓，等确认子代理确实需要账本再说。

## 下一步

`AGENTS.md` 的受注块还在写（`logic/store.mjs` 的 `commitItems` 仍在更新它），所以现在同一份前提会出现两次。退役它要动 `logic/` 与 `store.test.mjs`，等钩子在真机上验过再动，免得验证时分不清是钩子的问题还是改动的问题。

## 真机：信任这一关

0.1.0 装完重启后，第一次提问**没有注入**。排查过程与结论：

- 部署副本本身没问题：拿缓存里的 `hooks/inject-hot-block.mjs` 直接喂一条假输入，输出完全正确。
- 宿主日志里没有任何钩子执行记录——没有报错，也没有跳过说明，**静默不跑**。
- 原因是钩子的信任没跟上：改命令/改脚本之后钩子处于未信任状态，宿主不执行它，也不报错。用户在设置里启用信任后，下一次提问立刻注入成功（`at=2026-10-05T07:50:18.116Z items=5`）。

**运维后果要记住**：信任是绑在钩子上的（核里有 `trusted_hash` / `currentHash` / `trustStatus: untrusted | trusted | modified`）。所以开发回路多了一步——**提升版本重装之后，要在设置里重新过一遍钩子信任**，否则它会安静地不工作。这个坑值得写进 README，因为它和"版本号不变就不重装"是同一类无声失败。

## 端到端验证（验收标准 2）

2026-10-05 · 版本 0.1.0，钩子信任已启用：

1. 侧聊里说"请直接调用 align_commit 修改工作区文件"，落一条新断言。侧聊自己调工具写了 `ALIGNMENT.md`。
2. 回主线程随便发一条消息，不做任何搬运、不读任何文件。
3. 注入里的 `items=` 从 5 变成 **6**，新条目 C-006 出现在受注块里。

主 Agent 这一轮**没有**读过 `ALIGNMENT.md`，而 C-006 是本轮才写进磁盘的——它只可能来自钩子。工单 11 判定做不到的那件事（侧聊落地 → 主线程下一轮自动带上）**成立**。

至此验收标准 1、2 通过；3（信任身份）的结论是"注入内容贴在用户消息后面，拿用户级位置"；4（退路）不需要了。

## 遗留

`AGENTS.md` 的受注块还在写，与新钩子重复，且它只在会话开始刷新、中途是陈的。退役它要动 `logic/store.mjs`、`logic/hot-block.mjs` 与 `store.test.mjs`，另开工单。
