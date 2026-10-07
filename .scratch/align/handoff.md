# align — 交接

写给下一轮对话或新线程的接手人。细节在各自文件里（`spec.md`、`issues/`、`memo.md`、`docs/discussion.md`），这里只回答四件事：这是个什么东西、现在在哪、哪些是验过的硬事实、下一步做什么。

（2026-10-07 重写过一次：删掉已完成工单的流水账，只留"接手就必须知道"的部分。）

## 这是个什么东西

一个 Codex 插件。要解决的问题：跟 Agent 对齐想法这件事，发生在主线程里就会跑题、占上下文，而且结论会被压缩吃掉，下一轮它又按旧前提继续。

三块能力：

1. **每轮注入**：`UserPromptSubmit` 钩子在每次提问时从 `ALIGNMENT.md` 现渲染"已确认项"，注入这一轮。这是唯一能保证"每轮必然被读到"的通道。
2. **落地**：`align_land` 弹宿主原生表单，每条候选选「Align（写进账本）/ Restate（只带回主线说一次）/ Ignore（不留痕）」。侧聊里落的 Restate 进 `.align/inbox.md`，由钩子在主线的下一次提问带上一次；主线程里落的当轮就说出来。
3. **账本面板**：`align_open_ledger` 直接开在侧边。看与改已经落下的条目——改标签（原地）、取代（改措辞，旧的留痕）、退休。

三个技能入口（输入框发 `/` →「技能」）：`align`（模型自主：追问交给侧聊）、`align-now`（手动：直接弹表单）、`align-ledger`（手动：直接开面板）。

## 现在在哪

仓库与宿主都是 **0.2.11**。已建成并真机验过：每轮注入、原生表单落地（主线程与侧聊都行）、收件箱一次性投递、取代与退休、账本面板的三种改动。

工单：**只剩两张**——**08**（面板真机复验 + 美化）与 **10**（探针 + ADR-0002 换题目，唯一没动过的老票）。01–04、11–16 已 resolved；05、06、09 已 wontfix。

## 验过的硬事实（别再重新踩）

1. `AGENTS.md` 只在 app 重启或线程重载时读一次，**不是每轮**——所以每轮载体只能靠钩子。
2. **未信任的钩子，宿主静默不跑**：日志里没有报错、没有跳过说明。重装之后必须去设置里过一遍信任。
3. 侧聊有自己的 `session_id`，且它的 `transcript_path` 是 `null`，主线程非 null——**这是判别"在不在侧聊里"的唯一可靠办法**（`agent_type` / `agent_id` 两边都不给）。
4. elicitation 回传 `{action, content}`；**没填的可选字段不出现在 `content` 里**，缺键要当"用户没填"。
5. **elicitation 不给选择型字段预填 `default`**（string + enum/oneOf/anyOf 一律跳过，`default` 只对文本、布尔、数字生效）。换 schema 形状也没用——这是刻意设计。建议只能落在枚举顺序、条目描述、空值按建议处理三处。
6. 插件能碰的 UI 只有 MCP App；工具声明 `_meta.ui.resourceUri` 就能渲染，**面板自己发 `ui/request-display-mode {mode:"fullscreen"}` 就会开在侧边**（宿主支持 `inline` / `fullscreen` / `pip`）。
7. **MCP 的 `tools/call` 里没有会话信息**——server 判不出自己是被主线程还是侧聊调的。要判就得让钩子把 `session_id` / `transcript_path` 写到两边都认得的绝对路径（`/tmp/align-session-<uid>/…`），工具调用时读回来。别用 `os.tmpdir()`：钩子带着 `TMPDIR`、MCP server 只拿到 `HOME` 与 `PATH`，两边算出来的路径不一样。
8. 注入是贴在用户当前消息**后面**到达的，所以效力规则必须写成三级——用户当前这条消息优先。
9. 插件钩子路径是 `<plugin>/hooks/hooks.json`，命令里可用 `${PLUGIN_ROOT}`。

## 开发回路（C-001）

改码 → 提升 `version`（`.codex-plugin/plugin.json`、`package.json`、`mcp/server.mjs` 的 `serverInfo` 三处）→ `npm run plugin:install` → 重启 app → **重过钩子信任**。宿主跑的是物化到 `~/.codex/plugins/cache/align-dev/align/<version>/` 的副本，版本号不变就不会重装。

跑测试：`npm test`。`logic/` 不许 import 任何 MCP 或 Codex 的东西，有测试盯着（ADR-0001）。

调试收件箱：`/tmp/align-hook-trace.on` 存在时，钩子会往 `/tmp/align-hook-trace.log` 记一行 `session / turn / transcript`。删掉标记文件即可关闭，不用重装。

## 下一步

1. **工单 08**：真机复验面板（渲染、371px 布局、三种改动点在手里生效），以及用户明说"先不急"的**整体美化**。有一条已知教训：宿主 iframe 里别用 `background: transparent` 的原生控件（会撞色成空白），`<select>` 已经换成按钮。
2. **工单 10**：探针 + ADR-0002 换题目（原来那个题目写的是线程层，早作废）。
3. `memo.md` 的"待处理"表：退休不可逆、协议兜底值、上限默认值两处、收件箱空文件、node 绝对路径。

## 别忘

- `ALIGNMENT.md` 是账本，`GLOSSARY.md` 是词表——**所有输出都用词表里的词**（禁用：事实、结论、记忆、保存、提交、同步）。改一条已有的已确认项走"取代"，没有后继者走"退休"，**删除不存在**。
- `docs/discussion.md` 是用户自己的讨论记录，别当规格改。
- 每条能改变做法的实测结论都同时进了 `ALIGNMENT.md`——那是每轮都会注入的前提，比任何文档都"在场"。
