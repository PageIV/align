# 20 — node 不再写死路径：两个入口走一句启动壳

Status: 待真机复验
Blocked by: 无
Type: task

## 背景

memo 里最后一条：`.mcp.json` 与 `hooks/hooks.json` 都把 node 写死成 `/opt/homebrew/bin/node`。

为什么当初必须写死：宿主从 Dock 启动时的 PATH 是 launchd 那一套。2026-10-07 读应用进程自己的环境确认：

```
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin      # Homebrew 的 /opt/homebrew/bin 不在里头
```

所以裸写 `node` 会找不到。但这带来两个问题：

1. **换环境就断**：换机器、改用 nvm/Volta/asdf、Intel Mac（Homebrew 在 `/usr/local`）。
2. **断得无声**：node 找不到时，钩子根本不会被执行、MCP server 也起不来——**我们自己的代码一行都跑不到**，连报错都写不出来。表现只是"插件没反应"。

顺带一个陷阱：这台机器 `/usr/local/bin/node` 存在但是 **v18.17.0**，而平时的 Homebrew 那个是 **v26.10.0**。所以"改成裸 `node`"不会断，但会悄悄降级（99 条测试在 18 上也全过，版本不是硬约束，但降级不该是无声的）。

## 交付

- 新增 `scripts/run-node.sh`：按固定顺序找 node（`$ALIGN_NODE` → `/opt/homebrew/bin` → `/usr/local/bin` → nvm 最新 → Volta/asdf/fnm → 宿主 PATH → 应用自带的 `cua_node`），找到就 `exec`。
- 找不到时：往 `$ALIGN_NODE_LOG`（默认 `/tmp/align-node.log`）写一行，**退出码 0**——钩子绝不能挡住提问（这是硬规矩）。
- 那个文件是**覆盖式**的：只留最后一次（"上一次用的是哪个 node、什么版本"），不会随每轮提问无限增长。
- 两个入口都改成 `/bin/sh` 指它（`/bin/sh` 在 macOS 上永远在）：
  - `.mcp.json`：`command: /bin/sh`，`args: ["./scripts/run-node.sh", "./mcp/server.mjs"]`
  - `hooks/hooks.json`：`/bin/sh "${PLUGIN_ROOT}/scripts/run-node.sh" "${PLUGIN_ROOT}/hooks/inject-hot-block.mjs"`
- `scripts/run-node.test.mjs`：5 条测试盯住"找得到 / 参数透传 / 指定就用指定的 / 找不到也不挡提问且 stdout 干净 / 成功时日志记下用的是哪个 node"。

## 没走的路

- **裸 `node` / `/usr/bin/env node`**：跟着宿主给的 PATH 走。这台机器能跑（会用到 v18），换台机器照样断。
- **直接用应用自带的 node**：路径还是写死的，而且 `cua_node` 是 computer-use 插件的私有资产，app 升级可能挪走。

## 验收标准

1. 真机：重启后钩子照常注入（注入行还在），`align_*` 工具照常在。
2. `/tmp/align-node.log` 里写着这次用的是哪个 node、什么版本。
3. `ALIGN_NODE` 指一个不存在的路径时，钩子不挡提问，日志里写着"找不到 node"。
4. `npm test` 全绿（含 5 条启动壳测试）。

## Comments

- 2026-10-07 · 实现（0.2.19）。本机验过两条链路：喂一条假钩子输入，注入 JSON 正常；喂 MCP `initialize`，`serverInfo` 正常。选中的是 `/opt/homebrew/bin/node` v26.10.0。
