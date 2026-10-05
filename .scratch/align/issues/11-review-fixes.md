# 11 — 评审修复

Status: open
Blocked by: 无
Type: task

## 目标

工单 01、02 是自审的，没有独立视角（`align_list` 漏挂 `tools/list` 那个 bug 是撞见的，不是流程保证会撞见的）。2026-10-05 补了一次双轴评审（标准轴 + 规格轴）。这一票收的是评审发现里改法明确、且不属于任何未来工单的部分。

## 交付

- **面板回传 `source`**：`align_review` 已经把 `source` 放进 `structuredContent`（`mcp/server.mjs`），面板的 tool-result 处理器只读了 `root` 和 `candidates`（`ui/panel.html`），提交时也只带 `items` 和 `root`。结果服务端永远走 `params?.source ?? localDate()` 回落，账本的 `来源：` 只剩日期。
- **重复落地**：落地成功后按钮重新点亮、复选框不动，再点一次会把同一批断言按新编号再落一遍。实测：同一 draft 调两次 `commitItems`，得到 C-001 与 C-002 两条一字不差的断言，账本和热块各出现两次。唯一幂等的是受管区块标记本身。
- **README 工具面漏 `align_list`**：`README.md` 的目录图写 `align_review / align_commit / probe_open_panel`，服务器其实注册了 `align_list`。和当初掩盖那个 bug 的漂移是同一类。
- **禁用词**：`README.md` 开头用了「结论」，`logic/store.test.mjs` 的测试名用了「提交」。`GLOSSARY.md` 第 3 行说规则覆盖测试名与 UI 文案。
- **版本常量对齐**：`.codex-plugin/plugin.json` 是 `0.0.2`，`mcp/server.mjs` 的 `serverInfo.version` 还是 `0.0.1`。开发回路的诊断口诀（C-001）靠"宿主自报版本 == 清单版本"判断有没有重装，这个不一致会误导。`initialize` 的协议兜底 `2025-06-18` 也不是实测值（实测 `2026-01-26`）。
- **上限默认值三处合一**：`logic/hot-block.mjs`、`logic/config.mjs`、`logic/store.mjs` 各写了一份 `20`。

## 待定

重复落地的拦法二选一：

1. 面板侧——落地成功后清掉已落地的行，同一批点不出第二次。
2. 逻辑侧——`commitItems` 按 `statement` 去重。

倾向 1：逻辑层去重会让"确实想落两条一样的断言"变得做不到。

## 验收标准

1. `npm test` 全绿，并新增用例覆盖 `source` 回传、以及"同一批落地两次只产生一条"。
2. 真机：面板落地后，账本条目的 `来源：` 带得出调用方传的那串，而不是裸日期。
3. `README.md` 与 `logic/store.test.mjs` 不再命中 `GLOSSARY.md` 列的禁用词。
4. `plugin.json` 的 version 与 `serverInfo.version` 一致。

## 上下文指针

- `docs/adr/0001-align-codex-first-host-agnostic-core.md`
- `GLOSSARY.md`（禁用词表）
- `.scratch/align/issues/03-type-policy.md`、`04-supersede.md` —— 评审另有两项落在这两张未来票上，见下

## 归属其他工单的评审发现

- **03**：`mcp/server.mjs` 的 `align_commit` 返回文案把四种类型写死（"错误纠正和方向纠偏需要复述，另外两类不用"），违反规格《风险》"类型策略是配置不是代码"；同时 `logic/config.mjs` 的 `typePolicy()` 生产路径无人调用。面板的 `TYPES` 数组也硬编码了四个 slug。
- **04**：`logic/item.mjs` 用 `status` 同时当状态和关系（`superseded by C-0NN` 是个展示字符串），`isActive` 只认 `=== "active"`，supersede 链没有结构。
