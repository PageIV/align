# 21 — 分享给别人：仓库本身就是 marketplace

Status: resolved
Blocked by: 无
Type: task

## 目标

把插件交到别人手里，并回答"别人的机器上找得到 node 吗"。

## 查到的事实

- `codex plugin marketplace add <SOURCE>` 吃四种源：本地路径、`owner/repo[@ref]`、HTTPS Git、SSH Git。
- marketplace 的格式就是 `<root>/.agents/plugins/marketplace.json`，插件按 `source.path` 相对它定位。
- **`path: "."` 可用**：插件目录与 marketplace 根可以是同一个。拿最小样例验过（`plugin list` 里出现 `align@align-share-test`），也拿真仓库的副本验过（出现 `align@align`）。
- CLI 里没有"发布到官方目录"的入口——第三方分发只能自建 marketplace。
- 应用自带的 node：`/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`，**v24.21.0**。

## 交付

- 仓库根加 `.agents/plugins/marketplace.json`（`name: align`、`path: "."`）——从此"这个仓库"就是可分发的 marketplace。
- README 加"分享给别人"一节：两条命令 + 装完必须做的两步（重启、过钩子信任）+ node 不用自己装 + 那句提醒（`align-dev` 是本机的开发用 marketplace）。

## 验收标准

1. `codex plugin marketplace add <本仓库副本>` 之后，`plugin list` 里出现 `align@align`。**已验**（/tmp 副本）。
2. 别人不需要装 node。**部分验**：启动壳的最后一条命是应用自带的 v24；本机两条链路都跑过。
3. 装完有人提醒"重启 + 过信任"。**已写进 README。**

## 没验到的

**真的在第二台机器、第二个人那里装一遍。** 本机只能验到 CLI 这一层（注册 + 列出）；对方的 app 版本、钩子信任页、以及他们机器上 `cua_node` 是否存在，都得等真人装一次才知道。

## Comments

- 2026-10-07 · 实现（0.2.20）。第一次拿**真仓库路径**注册时，`plugin list` 里那个 marketplace 底下是空的——因为 `align-dev` 的 `plugins/align` 是个指向同一目录的符号链接，CLI 认出同一个插件就不再列第二遍。换成 /tmp 副本立刻正常，所以是去重、不是配置错。
- 2026-10-07 · README 拆成两侧：**"分享给别人"是给对方照着做的**（两条命令 + 重启 + 过信任 + 对方要什么 + 更新怎么做 + "整个仓库都会被物化过去"这件事），**"推到远端（GitHub 私有）"写在开发一节里**，是给自己的。仓库目前没有远端（`git remote -v` 为空），分支 `master`。
