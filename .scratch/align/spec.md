# align — v1 规格

状态：已确认。设计树已走完，无未决问题。

工单：`.scratch/align/issues/`（01–10，带 `Blocked by` 阻塞边）。

## 问题

主 Agent 的回答里可能藏着未经确认的前提——概念的含义、某个判断的真假、路线的选择。在主线程里追问会跑题、占上下文，而且澄清的结论还会被压缩吃掉，下一轮它又按旧前提继续。

## 目标

把"追问一条回答"和"把结论固定下来"拆成两件事：追问在隔离上下文里进行，不污染主线；结论由你逐条勾选后落地，并按类型决定要不要让主 Agent 复述。

## 成功标准

1. 新会话（或上下文被压缩之后），主 Agent 能说出当前生效的项目层已确认项。
2. 你直接打开 `ALIGNMENT.md` 就能一眼看完当前对齐了什么。
3. 侧聊的内容不进入主线程上下文。
4. 增删类型只改 `.align/config.toml`，不改代码。

## v1 范围

**做**：一条完整路径——挑一条回答 → 隔离侧聊追问 → 勾选候选断言 → 选类型与作用域 → 落地 →（按类型）复述。

**不做**：自动检测"这条回答有问题"并提示你追问；跨项目的全局确认项；对确认项做事实验证；改写主线程的历史消息；多线程并行对齐。

## 端到端流程

1. **入口**：你指着一条回答（选中文字，或说一句"关于上一条回答…"）。
2. **侧聊**：主 Agent 派生子代理，只喂那条回答加必要上下文，遵守 `/btw` 纪律——只用已有上下文、单轮、简短、不调工具。
3. **确认**：你说"这条算数"→ 主 Agent 调 `align_review(candidates)` → 面板内联渲染。
4. **勾选**：面板里勾断言、确认或修改类型、选作用域（默认线程层）。
5. **落地**：项目层由插件写 `ALIGNMENT.md` 并更新 `AGENTS.md` 热块；线程层由面板调 `ui/update-model-context` 注入（带 `structuredContent`）。
6. **复述与承重**：`restate = true` 的条目，面板再发一条 `ui/message` 可见卡片——它一次做两件事：触发复述，并把内容写进对话历史。`restate = false` 的条目只注入，等你的下一条消息把内容带进历史。

## 载体

| 内容 | 位置 | 谁写 | 何时被读到 |
| --- | --- | --- | --- |
| 项目层条目（热） | `AGENTS.md` 受管区块 | 插件 | 每轮自动进入上下文 |
| 项目层条目（全量与历史） | `ALIGNMENT.md` | 插件 | 按需、由人打开 |
| 类型策略 | `.align/config.toml` | 人 | 插件运行时 |
| 线程层条目 | 注入（一次性附着）+ 对话历史 | 插件 | 随你的下一条消息进入历史；压缩后失效 |

线程层不落文件是刻意的：一条只在这轮对话里成立的修正，不该污染仓库。但它的持久性**很弱**——注入只保证你的下一条消息带上它，之后靠对话历史承重，压缩即失效。真正要紧的东西必须显式**提升**到项目层，那是唯一每轮自动生效的硬保底。

## 数据格式

账本条目：

```markdown
### C-014 · direction-correction · 2026-10-04
断言：不要再往 docs/ 里加新目录，文档统一放 docs/agents/。
来源：2026-10-04 · thread 01a104a1 · 修正回答 #37
状态：active
```

失效条目不删除，改成 `状态：superseded by C-0NN` 并移入"已失效"区，保留 `superseded` 链——"我们曾以为是 X、后来改成 Y"这段历史本身就是对齐价值。

热块：

```markdown
<!-- align:begin -->
## 已确认前提（由 align 维护，勿手改）

- [C-014] direction-correction：不要再往 docs/ 里加新目录，文档统一放 docs/agents/。
<!-- align:end -->
```

类型策略：

```toml
# 类型策略：类型 → 行为。增删类型只改这里，不改代码。
hot_block_max_items = 20

[types.concept-alignment]
restate = false

[types.error-correction]
restate = true

[types.direction-correction]
restate = true

[types.detail-completion]
restate = false
```

热块只装 `active` 的项目层条目，超过 `hot_block_max_items` 时最老的条目仍在 `ALIGNMENT.md` 里但退出热块。

## 架构

```
.codex-plugin/plugin.json      清单：name=align, skills, mcpServers
skills/align/SKILL.md          入口与侧聊纪律（/btw 风格）
mcp/server.mjs                 MCP server：align_review / align_commit / align_list / align_promote
ui/panel.html                  MCP App 面板（勾选 + 类型 + 作用域 + 落地）
logic/                         宿主无关的纯逻辑：存储、类型策略、supersede、账本序列化
```

`logic/` 不得 import 任何 Codex 或 MCP 相关的东西（见 ADR-0001）。

**工作目录陷阱**：MCP server 的 `cwd` 是插件目录，不是用户的项目。所有写文件的工具都接受 `root` 参数，主 Agent 必须显式传入当前工作区的绝对路径；省略时默认落到插件目录，那会是个安静的错。`CODEX_WORKSPACE_ROOT` 如果被宿主设置了会优先于默认值，但不要依赖它。

## 已验证的技术前提（2026-10-04 · 真机）

用探针插件（`.codex-plugin/` + `mcp/server.mjs` + `ui/panel.html`）在真机上跑通了完整四步。协议协商结果为 `2026-01-26`，宿主 `chatgpt 26.930.41038`。

### 宿主自报的能力

```
message:            {text, image, resourceLink, resource}
updateModelContext: {text, image, resourceLink, resource, structuredContent}
serverTools, serverResources, logging, openLinks: 均有
sandbox.csp: baseUriDomains / connectDomains / frameDomains / resourceDomains 全空
experimental: openai/modelContext, openai/message{draft}, openai/find, openai/files, openai/skillsDeepLinks
```

`updateModelContext` 支持 `structuredContent` 是最重要的一条：账本条目可以走结构化数据，不必压成文本再解析。

### 两个杠杆的确切行为

| 通道 | 到达形态 | 可见 | 触发一轮 | 生命周期 |
| --- | --- | --- | --- | --- |
| `ui/update-model-context` | `kind: model_context`、`source: mcp_app` | 输入框上方一个叫"上下文"的小框 | 否 | **一次性**：随你的下一条消息发出即消耗 |
| `ui/message` | `kind: message`、`source: mcp_app` | 是 | 是 | 进入对话历史 |

**关键更正（当日二次实测）**：`ui/update-model-context` 不是持久上下文，而是挂在下一条消息上的附件。实测序列是"注入 → 发『1』（注入跟着到达）→ 发『2』（什么都没到达）"，且小框在『1』发出后消失。这个通道的命名有误导性——它有"待发送"的语义，没有"持续生效"的语义。

后果有三条：

1. 内容一旦随消息发出，就成为**对话历史的一部分**，后续轮次仍然可见（这是主 Agent 能在数轮之后复述标记的真正原因）。但那是历史的功劳，不是这个通道的。
2. **用户注入后若不发消息**——删掉小框、关掉 app、或者干脆不说话——内容直接丢失。所以落地动作不能只做注入。
3. 由此，"持久"只剩文件一条路：`AGENTS.md` 热块是唯一每轮自动生效的机制。

`structuredContent` 是以解析后的对象送达的，不是字符串。`ui/message` 也不是"填草稿"——它立刻作为一条消息送达并触发模型的一轮。

两条都以 `untrusted_input` 标记到达，来源标为 MCP app。**账本内容是数据，不是指令通道**——实现里不得把注入内容当指令或授权执行。

### 面板的运行环境

- 内联时 `displayMode: inline`；展开后是 `fullscreen` 的侧边面板，容器约 **371×772**。正式面板按 ~371px 宽设计。
- CSP 域名列表全空，CSS/JS 必须内联，不能引外部资源。
- 工具绑界面的写法（抄自 code-review）：`_meta: { ui: { resourceUri, visibility } }`，MIME 固定 `text/html;profile=mcp-app`；兼容旧别名 `ui/resourceUri`、`openai/outputTemplate`。
- 门控不是"是否一方插件"，而是"composer 可用 + 面板存活"；面板关掉后再注入会得到 `-32000 The widget source is no longer active`。

### 本 repo 的开发回路

- 开发用 marketplace 在 `~/.codex/dev-marketplaces/align-dev/`，`plugins/align` 是指向本 repo 的符号链接。注册只有两段：`[marketplaces.align-dev]` 与 `[plugins."align@align-dev"] enabled = true`。
- **宿主会把插件物化（复制）到自己的缓存**：`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`。跑的是那份副本，不是这个仓库——符号链接只在物化那一刻被跟随。
- **版本号不变就不会重新物化。** 实测：改完 `server.mjs` 与面板后重启，跑的还是旧副本，新工具根本不存在。所以开发循环是"改代码 → 提升 `plugin.json` 的 version → 重启 app"。这一条推翻了我早先"改 repo 重启即可"的说法。
- 由此也解释了之前那次"新标记没生效"：既是面板资源被缓存，也是整份插件没换。诊断时先看缓存目录里的版本号，比猜快。

### 仍未验证

1. 对话历史被**压缩**之后，靠历史承重的线程层条目是否还在。压缩难以主动触发，未实测。
   兜底：`restate = true` 的类型本来就会留下可见卡片；`restate = false` 的类型在压缩后可能静默失效。正式实现要把"往对话里放东西"留成可替换的一层，并设一个重要程度阈值——重要的直接提升到项目层。
2. 小框能否**手动删除**，删除是否等于撤销注入。目前只观察到"发出后消失"。

## 风险

- **热块的 token 成本**随项目层条目数增长。用 `hot_block_max_items` 和"线程层默认不落文件"两道闸控制。
- **每次落地都会改 `AGENTS.md`**，会打断一次 prompt 缓存。落地频率低，可接受；如果实测太吵，就把热块挪到独立文件并接受"需要显式读"的代价。
- **类型会变**。所以类型策略是配置不是代码；任何把四种类型写死在分支里的实现都违反本规格。
- **线程层的持久性是弱的**，这是刻意取舍（不污染仓库），但 UI 文案必须让人看得懂，不能让人以为它和项目层一样可靠。
