# 16 — 手动入口 align-now

Status: resolved
Blocked by: —
Type: task

## 目标

现在调出落地表单只有一条路：模型自己判断该弹（`align` 技能），或者用户说一句"调用 align_land"。后者太傻——**用户想弹表单时应该有个确定的入口，不依赖模型的判断**。

插件因此有两种呼出方式：模型自主（`align`，追问完顺手落地）与手动命令（`align-now`）。

## 交付

- `skills/align-now/SKILL.md`：手动入口。被调起时**不绕侧聊、不反问**，直接从最近一轮整理 1–5 条候选断言，调 `align_land` 弹表单。
- `skills/align/SKILL.md` 里加一句分流：没有要追问的、只想弹表单的，走 `align-now`。

## 为什么是技能而不是 `/` 命令

宿主不支持插件注册斜杠命令：本地 `plugin.json` 能声明的贡献只有 `skills` / `hooks` / `appTemplates` / `mcpServers` / `scheduledTasks`，桌面 app 的斜杠命令是一份内置白名单。但 app 的 `/` 菜单里有「技能」分组，选中一条技能就是把技能提词插进输入框——所以 `/` → 技能 → `align-now` → 回车，是今天能拿到的最短路径。

（远端 marketplace 的 API 里有 `RemotePluginCommandManifest`，另一个"从别的 agent 迁移配置"的枚举里有 `COMMANDS`。也就是说"插件带命令"在数据模型里有影子，但本机这份本地清单不吃这个字段。留待 app 升级后再看。）

## 验收标准

1. 输入框里发 `/`，「技能」分组里出现 `align-now`（与 `align` 并列）。
2. 选中它、回车之后**第一件事就是弹表单**：不问"你想落哪几条"、不劝去开侧聊。
3. 表单里的候选取自最近一轮的内容，每条带建议目的地与标签。
4. 表单里选 Align 的照常写进 `ALIGNMENT.md`。

## Answer

四条 AC 2026-10-06 真机全过：`/` →「技能」组里 `align` 与 `align-now` 并列；选中 `align-now` 之后第一件事就是弹表单，没有多余的话；候选取自上一轮（空值按建议处理那条被选了 Align，落了 C-013、C-014）；同一次里第三条选 Restate，工具结果要求当场原样说出来，照做。

技能正文里加了一条边界：改一条已有已确认项时（用户说"那条不对了"），候选要带 `supersedes: "C-0NN"`，别新增一条让两条并存。

## Comments

- 2026-10-07 · 手动入口变成**一族**，不止这一个技能。第二个是 `align-ledger`（工单 08 里加的）：`/` →「技能」→ align-ledger 直接打开账本面板。两者的分工与 `align`/`align-now` 一样——**模型自主判断 vs 用户主动叫**；名字里带 `-now` 的那个弹表单，带 `-ledger` 的那个开面板。

## 上下文指针

- `skills/align/SKILL.md`（自主路径）
- 工单 15（表单与目的地）
- 已确认项 C-007（落地统一走 align_land 的原生表单）
