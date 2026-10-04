# align

一个 Codex 插件：对 Agent 的回答在**隔离上下文**里追问，把确认下来的结论**落地**回主线程，让后面的对话不用重新对齐。

当前状态：**端到端最薄闭环**（工单 01–02）。设计已封板，见 [`.scratch/align/spec.md`](.scratch/align/spec.md)；工单与依赖图见 [`.scratch/align/issues/`](.scratch/align/issues/) 与 [`.scratch/align/graph.md`](.scratch/align/graph.md)。

## 它做什么

1. 你指着主 Agent 的一条回答提问，追问在隔离上下文里进行，不占主线。
2. 你把认可的断言勾出来，给每条选一个类型（概念对齐 / 错误纠正 / 方向纠偏 / 细节填充）。
3. 落地分两条路：
   - **项目层**：写 `ALIGNMENT.md` 并更新 `AGENTS.md` 里的受管区块——每轮自动生效，活过新会话。
   - **线程层**：用 `ui/update-model-context` 附着到你下一条消息上，一次性，之后靠对话历史承重。

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

**改完必须重启 app。** 宿主会缓存 MCP App 的资源，改 `ui/panel.html` 后不重启看不到新版本——实测踩过。

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
