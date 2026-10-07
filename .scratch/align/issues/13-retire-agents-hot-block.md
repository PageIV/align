# 13 — 退役 AGENTS.md 受注块，改写 spec 的载体表

Status: resolved
Blocked by: 12（已 resolved：钩子成为每轮载体）
Type: task

## 背景

工单 12 端到端验成之后，`AGENTS.md` 里的受注块变成了纯粹的负担：

- **重复**：同一份生效项，每轮既从 `AGENTS.md` 进来，又从钩子进来。
- **更糟的是它是陈的**：`AGENTS.md` 只在 app 重启或线程重载时读一次（工单 11），所以中途落地的条目在两个通道里会给出不同版本。
- 它当初存在的唯一理由是"这是唯一每轮自动生效的通道"，而这个前提已经不成立。

## 交付

- `logic/store.mjs` 的 `commitItems` 不再写 `AGENTS.md`
- 已有仓库的受注块要被**清掉**（不是留着不管）：落地下一次时，识别并移除 `<!-- align:begin -->…<!-- align:end -->` 整段，用户写在别处的字节一个不动
- `logic/hot-block.mjs` 里 `upsertHotBlock` 的去留一并决定：钩子只用 `renderHotBlock`，写回那部分若无人使用就删掉，连同它的测试
- `store.test.mjs` 里"热块跟着更新""受注块不重复"这类断言，改成"账本更新、`AGENTS.md` 不被触碰"
- `.scratch/align/spec.md` 的载体表改写真值：项目层条目由**钩子**每轮注入，`ALIGNMENT.md` 是唯一事实来源

## 验收标准

1. 落地一条后 `git status` 里没有 `AGENTS.md` 的改动，`ALIGNMENT.md` 正常追加。
2. 在一份带旧受注块的仓库上落地，旧区块被移除且文件其余部分逐字节不变。
3. `npm test` 全绿，且没有留下测"写回热块"的僵尸测试。
4. spec 里不再出现"`AGENTS.md` 受管区块每轮自动生效"这类已被推翻的说法。

## 风险

没有用户提问的轮次（子代理、自动化）将**不再**自动拿到账本——这是退役受注块的真实代价。要不要为此挂 `SubagentStart`（核里实测该事件也能注入 `additionalContext`），在这张票里一起定。

## 上下文指针

- 工单 11 的 Comments（`AGENTS.md` 不是每轮重读的实测）
- 工单 12 的 Answer（钩子为什么更强）
- `logic/store.mjs`、`logic/hot-block.mjs`、`logic/store.test.mjs`

## Answer

2026-10-05 落地，版本 0.2.0。

- `logic/store.mjs` 的 `commitItems` 不再写 `AGENTS.md`；若发现旧受注块就顺手摘掉，除此之外一个字节不碰，文件不存在也不凭空创建。
- `logic/hot-block.mjs` 的 `upsertHotBlock` 删掉，换成 `removeHotBlock`；`renderHotBlock` 留给钩子用。
- `store.test.mjs` 重写：新增"不碰 AGENTS.md""没有就不创建""老受注块被摘掉且其余内容逐字节不变""区块在中间时不把上下文粘在一起"；删掉两条测写回热块的。`hot-block.test.mjs` 同步。`npm test` 39/39。

**关于"没有用户提问的轮次"那个风险**：暂不挂 `SubagentStart`。子代理会继承项目层的 `AGENTS.md`，而 `AGENTS.md` 里已经不放受注块了，所以它们确实拿不到账本——但眼下没有证据说子代理需要它。等真出现"子代理按错前提干活"再挂，那时是个一行的改动。
