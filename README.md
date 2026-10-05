# align

一个 Codex 插件：对 Agent 的回答在**隔离上下文**里追问，把确认下来的结论**落地**回主线程，让后面的对话不用重新对齐。

当前状态：**端到端最薄闭环**（工单 01–02）。设计已封板，见 [`.scratch/align/spec.md`](.scratch/align/spec.md)；工单与依赖图见 [`.scratch/align/issues/`](.scratch/align/issues/) 与 [`.scratch/align/graph.md`](.scratch/align/graph.md)；不占主线的细节记在 [`.scratch/align/memo.md`](.scratch/align/memo.md)。

## 它做什么

1. 你指着主 Agent 的一条回答提问，追问在隔离上下文里进行，不占主线。
2. 你把认可的断言勾出来，给每条选一个类型（概念对齐 / 错误纠正 / 方向纠偏 / 细节填充）。
3. 落地分两条路：
   - **项目层**：写 `ALIGNMENT.md` 并更新 `AGENTS.md` 里的受管区块——每轮自动生效，活过新会话。
   - **线程层**：用 `ui/update-model-context` 附着到你下一条消息上，一次性，之后靠对话历史承重。

## 怎么打开面板

**面板不是网页。** 它由主 Agent 调用 `align_review` 打开，作为 MCP App 内联渲染在对话里（可以再展开成侧边面板）。

直接在浏览器里打开 `ui/panel.html` 是不行的：那里没有 MCP 宿主，`ui/initialize` 没人应答，`tools/call` 也没人转发，落地按钮点了不会有任何反应。面板现在会直说这件事，而不是让你对着一个死按钮猜。

## 类型策略

类型是开放集合：**增删类型只改项目根下的 `.align/config.toml`，不改代码，也不用重装**——服务器每次开面板时现读那份配置。

```toml
hot_block_max_items = 20

[types.direction-correction]
restate = true

[types.foo]
label = "新花样"
```

`restate = true` 的类型落地后，面板会替你发一条可见卡片，触发主 Agent 复述。没写 `restate` 的类型一律静默（新类型不该意外打断你）；`label` 只影响面板上的中文，省略时用 slug。默认的那几类见 `logic/config.mjs` 里的默认值表。

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

排查口诀：**先看 `npm run plugin:status` 里宿主眼里的版本号**。它和你清单里的版本不一致，就是没重装，别去猜别的地方。这个版本号来自宿主自己的记录，比看文件时间戳快也准。

跑测试：

```sh
npm test
```

## 探针

`probe_open_panel` 是一个保留在插件里的自检工具：它打开一个面板，用两个按钮分别测试 `ui/update-model-context` 与 `ui/message`。app 升级之后用它复测宿主能力——这两条通道是否会变，是这套设计里最不确定的一点。

面板里会显示宿主自报的能力（`message`、`updateModelContext` 等），以及每次注入返回的标记。

## 目录

```
.codex-plugin/plugin.json   插件清单
.mcp.json                   MCP server 启动方式
mcp/server.mjs              工具面：align_review / align_commit / probe_open_panel
ui/panel.html               正式面板
ui/probe.html               探针面板
logic/                      宿主无关的纯逻辑：账本、热块、存储、类型策略
```

`logic/` 不得 import 任何 MCP 或 Codex 相关的东西，这条有测试盯着（见 ADR-0001）。
