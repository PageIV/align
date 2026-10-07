# align

一个 Codex 插件：对 Agent 的回答在**隔离上下文**里追问，把确认下来的**已确认项**落地，让后面的对话不用重新对齐。

当前状态：**每轮注入 + 三个目的地 + 收件箱**（工单 01–15 里已做完的那些）。设计已封板，见 [`.scratch/align/spec.md`](.scratch/align/spec.md)；工单与依赖图见 [`.scratch/align/issues/`](.scratch/align/issues/) 与 [`.scratch/align/graph.md`](.scratch/align/graph.md)；不占主线的细节记在 [`.scratch/align/memo.md`](.scratch/align/memo.md)。

## 它做什么

1. 你指着主 Agent 的一条回答提问，追问在隔离上下文里进行，不占主线。
2. 侧聊里说清之后，主 Agent 把结论压成候选断言，每条带上一条**建议目的地**，调 `align_land` 弹原生表单。
3. 你逐条选去哪（默认停在建议上，不改就是同意）：
   - **Align**（落地）→ 写 `ALIGNMENT.md`，`UserPromptSubmit` 钩子在下一次提问时注入，之后每轮自动生效，活过新会话与压缩；
   - **Restate**（复述）→ 只在主线的下一次提问里带上一次，随即消失（进 `.align/inbox.md`，投递即消费）。命令式的要求、够不上一条已确认项的片段走这条；
   - **Ignore**（不落地）→ 不留痕，逐条丢掉用。

   整张表单都不想决定时按自带的 **skip**——那是全部不提交，账本一字节不动。
4. 每条断言还带一个**标签**（概念对齐 / 错误纠正 / 方向纠偏 / 细节填充）。标签只影响账本与热块里的行首前缀，不决定行为。

### 一条已确认项过时了怎么办

让模型用**取代**：候选断言上带 `supersedes: "C-0NN"`，你在表单里点 Align 之后，旧条目状态变成 `superseded by <新编号>`、移进 `ALIGNMENT.md` 的"已失效"区，链留在文件里，但热块从下一轮起就不再带它。

旧的**不删**是刻意的——"我们曾以为是 X、后来改成 Y"本身就是对齐价值。填错编号时新断言照样落地，只在工具结果里报一句"没有可取代的对象"，不会静默丢东西。

## 每轮生效是怎么来的

靠一个插件钩子，不靠 `AGENTS.md`。

`hooks/inject-hot-block.mjs` 注册在 `UserPromptSubmit` 上——也就是你按下回车之后、模型开始这一轮之前。它在那**一刻**读 `ALIGNMENT.md`，渲染出当前生效项，通过 `hookSpecificOutput.additionalContext` 注入这一轮。

为什么不用 `AGENTS.md` 的受管区块：实测（工单 11）`AGENTS.md` 只在 app 重启或线程重载时读一次，中途改它不会回流到正在进行的线程。钩子是在提问那一刻现读，所以侧聊刚落的、面板刚改的、你手改的，只要在下一次提问之前落盘，就一定会被带上。

注入内容末尾有一行 `<!-- align:inject at=… items=… restatements=… -->`：`AGENTS.md` 的受注块里没有它，所以它出现在上下文里就说明钩子跑了。`restatements` 是这一轮带上的一次性复述条数。

没有账本也没有待投递复述的项目、以及任何异常，钩子都静默退出，绝不干扰提问。它不碰账本，只写两处：`/tmp` 里那行"这一轮在哪"的标记，和投递完之后收件箱的剩余内容。

### 钩子还顺手做的两件事

**记下"这一轮在哪"。** MCP 工具调用里没有会话信息——`align_land` 不知道自己是主线程调的还是侧聊调的，可"复述"去哪正好取决于这个。钩子知道（它有 `session_id` 与 `transcript_path`），所以每次提问时把它记到 `/tmp/align-session-<uid>/<项目哈希>.json`，工具调用时读回来。认不出来（钩子没跑过、旧标记已经不存在）就按侧聊处理：写进收件箱最坏是晚一轮到，当成主线程当场说出来则可能随侧聊一起消失。

放 `/tmp` 而不放项目里：这是每轮都变的派生物，塞进项目会让 `git status` 一直脏。也不能用 `os.tmpdir()`——钩子是宿主直接 exec 的（带着 `TMPDIR`），MCP server 只拿到 `HOME` 与 `PATH`，两边算出来的路径不一样。

**投递并消费收件箱。** 只投给主线程（`transcript_path` 非空），投出去就从 `.align/inbox.md` 里删掉。写回失败就一条都不投——留在收件箱里下一轮还会来，宁可晚到也不要重复。

## 怎么用

1. 指着一条回答（选中文字，或说一句"关于上一条回答…"），让主 Agent 走 `align` 这个 skill。
2. 追问在**侧聊**里做：输入框发 `/side`（快捷键 `Cmd+Shift+;`）开一个临时侧聊。它继承这条对话的历史但只当只读参考，而且**侧聊里说的话不会自己回到主线程**——这是它可以被信任的原因。
3. 你说"这条算数"。主 Agent 把答案压成候选断言，调 `align_land` 弹出一张**原生表单**：每条断言选「Align / Restate / Ignore」，默认停在它给你的建议上；整张都不想决定就按 skip。**这张表单在主线程和侧聊里都能弹**，所以落地不必搬回主线程——在侧聊里直接落完就行。
4. 「Align」写进 `ALIGNMENT.md`，下一次提问时钩子读到它，主线程自动带上。「Restate」写进 `.align/inbox.md`，你回主线问下一句时带上一次，然后消失。

入口与纪律的全文在 [`skills/align/SKILL.md`](skills/align/SKILL.md)——那是主 Agent 读的那一份。

### 两个入口

插件带两个技能，都在输入框的 `/` 菜单里（「技能」分组）：

- **`align`**——模型自主判断的入口：你指着一条回答要追问时，它把追问交给侧聊。
- **`align-now`**——手动入口：你只想调出表单、没有要追问的东西时，用 `/` 选它（或输入框提 `$align-now`）。它不绕侧聊、不反问，直接把最近一轮整理成候选断言弹表单。
- **`align-ledger`**——手动入口：直接打开账本面板（看和改已经落下的条目），不念一遍内容、也不弹表单。

## 面板：查看与编辑账本

**面板不落地。** 落地统一走 `align_land` 的原生表单（已确认项 C-007），主线程和侧聊里都是同一张。面板管的是另一件事——**看和改已经落下的东西**：列出生效与已失效的条目、改标签、取代（改措辞）、退休，取代链看得见。

打开它：`/` →「技能」→ **`align-ledger`**（自己动手，不等模型），或让 Agent 调 `align_open_ledger`（"看看对齐了什么""把 C-008 改掉"）。

它作为 MCP App 渲染。**面板自己在握手之后请求 `fullscreen`**（`ui/request-display-mode`，宿主支持的三种是 `inline` / `fullscreen` / `pip`），所以它会直接开在侧边，不占主线；对话里只会留下一个入口卡片。宿主不给展开时，面板顶部会明说"用右上角的展开按钮"，不装作已经展开了。

三条行为上的取舍：

- **改措辞 = 取代**，不是原地改。旧的句子一个字节都不动，落成一条新条目，旧的标成 `superseded by`。想法变了要留痕，这是账本的第一原则。
- **只改标签就原地改**。标签只是给人看的前缀，换一个不留历史没有损失。
- **退休**是"这条不用再管了、也没有别的话要说"。和取代一样留在文件里，只是不再进热块。

顺带留个记录：**面板不是网页。** 直接在浏览器里打开 `ui/panel.html` 不行——那里没有 MCP 宿主，`ui/initialize` 没人应答、`tools/call` 没人转发，按钮点了不会有任何反应。面板自己写了这种情况的提示。

## 类型：只是标签

类型是开放集合：**增删类型只改项目根下的 `.align/config.toml`，不改代码，也不用重装**——服务器每次弹表单、每次渲染热块时现读那份配置。

```toml
hot_block_max_items = 20

[types.foo]
label = "新花样"
```

`label` 只影响账本与热块里显示的中文，省略时用 slug。类型**不决定任何行为**：要不要每轮生效、要不要复述，都由用户在表单上选目的地决定，不由类型推。

（曾经有一条 `restate` 类型策略——`restate = true` 的类型落地后触发复述。随工单 15 退役：一条命令式的断言落进账本会变成每轮重复一道命令，所以改用"目的地"来分流。老配置里残留的 `restate = true` 被当作陌生键忽略，不报错。）

## 开发

插件以本地 marketplace 的方式加载，`plugins/align` 是指向本仓库的符号链接：

```
~/.codex/dev-marketplaces/align-dev/
  .agents/plugins/marketplace.json
  plugins/align -> /Users/page/Documents/Work/pugins
```

`~/.codex/config.toml` 里对应两段：

```toml
[marketplaces.align-dev]
source_type = "local"
source = "/Users/page/.codex/dev-marketplaces/align-dev"

[plugins."align@align-dev"]
enabled = true
```

**改完要重新安装，然后重启 app。**

宿主不是直接读这个仓库。它把插件**物化（复制）**到
`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`，之后跑的是那份副本；源码目录只在安装那一刻被读一次。

实测踩过：改完 `server.mjs` 和面板后重启，跑的还是旧副本，新工具压根不存在——版本号没变，宿主就认为无需重装。

开发循环（已验证）：

1. 改代码。
2. 把 `.codex-plugin/plugin.json` 里的 `version` 提升一位。
3. `npm run plugin:install` —— 让宿主把新版本物化进缓存。装完会**替换**掉旧版本目录，不会堆积。
4. 重启 app。
5. **如果改动碰了钩子，去设置里的 Hooks 页重新过一遍信任。** 信任绑在钩子上（核里是 `trusted_hash` / `currentHash`）。没信任的钩子宿主**静默不跑**，日志里连报错都没有——和"版本号不变就不重装"是同一类无声失败。

排查口诀：**先看 `npm run plugin:status` 里宿主眼里的版本号**。它和你清单里的版本不一致，就是没重装，别去猜别的地方。这个版本号来自宿主自己的记录，比看文件时间戳快也准。

跑测试：

```sh
npm test
```

## 探针

只剩一个：**`probe_elicit`**。由插件 server 向宿主发一张 elicitation 表单（勾选框 + 多选 + 单选 + 文本框），看宿主渲不渲染、在**侧聊**里渲不渲染、回传的形状对不对，顺带带出宿主在 `initialize` 里自报的 client capabilities。不写任何文件。app 升级之后用它复测"落地表单这条路还在不在"。

2026-10-07 删掉了另外两个探针——`probe_open_panel` + `ui/probe.html`（测 `ui/update-model-context` 与 `ui/message`），以及 `hooks/probe-inject.mjs`。理由是它们测的东西**已经没有调用者**：线程层作废了、复述改走收件箱、而"钩子还在不在跑"每轮都被注入末尾那行 `<!-- align:inject … -->` 本身证明着。留着一个可调用却没人该调的工具，迟早会被误调（C-007 的教训）。要复测面板，直接调 `align_open_ledger` 就是最真实的测试。

宿主能力的实测结论记在 `.scratch/align/issues/11-host-capability-probe.md` 与 `12-hot-block-via-user-prompt-hook.md`；每条能改变做法的结论都同时进了 `ALIGNMENT.md`。

## 目录

```
.codex-plugin/plugin.json   插件清单
.mcp.json                   MCP server 启动方式
hooks/hooks.json            钩子声明（UserPromptSubmit）
hooks/inject-hot-block.mjs  每轮注入 + 投递收件箱 + 记"这一轮在哪"
skills/align/SKILL.md       侧聊入口与纪律（主 Agent 读的那一份）
skills/align-now/SKILL.md   手动入口：直接弹落地表单
skills/align-ledger/SKILL.md 手动入口：直接开账本面板
mcp/server.mjs              工具面：align_land（落地）/ align_edit（改与退休）/ align_open_ledger（面板）/ align_commit / align_list / probe_elicit
ui/panel.html               账本面板：查看与编辑（不落地）
logic/                      宿主无关的纯逻辑：账本、热块、收件箱、目的地、存储、配置
```

`logic/` 不得 import 任何 MCP 或 Codex 相关的东西，这条有测试盯着（见 ADR-0001）。
