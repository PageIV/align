# 11 — 宿主三通道真机验证（含 elicitation）

Status: resolved
Blocked by: 无
Type: task

## 目标

"主线程每轮拿到已确认项"和"从侧聊直接落地"这两个设想都押在宿主能力上，而这两条都还没实测。用探针一次问清三件事，答案决定 align 要不要砍掉线程层、落地 UI 换成什么。

## 要验的三条

1. **主线程是否每轮重读 `AGENTS.md`。** 在已经跑了几轮的线程里落地一条新条目，然后在**同一线程**问"现在生效的已确认项有哪些"。答得出来 = "每轮"成立；答不出来 = 热块只在新会话里生效，"主线程每轮拿到"这个前提作废。
2. **插件 server 发起的 elicitation 表单，宿主是否渲染。** `ChatGPT.app` 里有 `formElicitation` 的分派、`composer.mcpFormElicitation.*` 文案、boolean/enum/多选三套控件，CLI 核里也有 `McpServerElicitationRequest`——但第三方**本地**插件 server 这条路径没实测，`tool_call_mcp_elicitation` 开关的默认值也没确认。
3. **同一个 elicitation 在侧聊里是否照样渲染、照样回传。** 这是"侧聊里勾选 → 文件被写 → 主线程下一轮读到"整条路的关键一步。

附带要观察的：elicitation 是不是必须有 turn 才成立。面板按钮发起 `tools/call` 时手上没有 turn，模型调用时手上有——两条路都走一遍，差别本身就是证据。

## 交付

- `mcp/server.mjs`：加一层 server→host 请求（id 挂起表 + 响应分派 + 超时），新增自检工具 `probe_elicit`；顺便记下宿主在 `initialize` 里自报的 client capabilities
- `ui/probe.html`：加第三个按钮，显示 elicitation 返回的 `action` 与 `content`
- 三条的实测结果写进 `## Answer`，并同步 `.scratch/align/spec.md` 的"已验证的技术前提 / 仍未验证"

## 验收标准

1. 主线程里调用 `probe_elicit`，宿主渲染出原生表单；提交后工具结果里拿到勾选值。
2. 在侧聊里调用同一个工具，同样渲染、同样回传。
3. 落地一条新条目后，**同一线程**里主 Agent 能说出它，且用户没在对话里提过它。
4. 三条结论都带证据（探针日志、对话原文），不是"应该可以"。

## 失败时的退路

- 第 2 条不成立：落地 UI 只能留在主线程的 MCP App 面板上，侧聊降级成"追问处"，用户仍要回主线程说一句"落地"。
- 第 3 条不成立：热块只是新会话的保底，规格里"每轮自动生效"的说法要全文改掉。
- 表单 schema 不被接受（比如 untitled enum 解析失败）：换成 titled 写法 `oneOf: [{ const, title }]` 再试；`_meta["openai/elicitation"]` 是更宽的那条路。

## 上下文指针

- `ChatGPT.app/Contents/Resources/app.asar` 内：`webview/assets/mcp-server-elicitation-request-panel-*.js`、`inline-elicitations-*.js`、`thread-mcp-app-side-panel-tab-*.js`
- 工单 10（探针常驻 + ADR-0002）：同一批探针文件，10 管"把能力留住"，这张票管"问出新答案"
- `.scratch/align/spec.md` 的"仍未验证"
- `GLOSSARY.md`：热块、落地、侧聊

## Comments

- 2026-10-05 · **第 2 条成立。** `probe_elicit` 在 0.0.7 上真机跑通：主线程里模型调用它，宿主渲染出了原生表单（用户确认看到）。第一次失败是探针自己的锅——45 秒超时先到，工具返回 `ok:false`，表单还留在屏幕上可提交。把 `HOST_REQUEST_TIMEOUT_MS` 提到 480s，`.mcp.json` 的 `tool_timeout_sec` 从 60 提到 600（内层必须短于外层，否则宿主先掐断，我们连自己超时的机会都没有）。
- 2026-10-05 · 顺带拿到宿主自报的 client capabilities，比预期宽：

  ```json
  {
    "elicitation": { "form": {}, "url": {} },
    "extensions": {
      "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app", "text/html+skybridge"] },
      "openai/elicitation": { "form": {} },
      "openai/form": {}
    }
  }
  ```

  标准 `form` / `url` 两种模式都在，OpenAI 自己的表单扩展也挂着。所以"能力宣称"和"可用"这次对上了——之前怀疑的 `tool_call_mcp_elicitation` 开关并不是拦路虎。
- 2026-10-05 · 还欠三条：表单回传值的形状（`action` + `content`）、**侧聊**里是否同样渲染并回传、以及面板按钮那条无 turn 的路径。
- 2026-10-05 · **回传值的形状拿到了**（0.0.8，主线程，模型调用，11 秒回）：

  ```json
  { "ok": true, "action": "accept",
    "content": { "rendered": true, "picked": ["C-901"], "choice": "都行" } }
  ```

  要点三条：
  1. `content` 的键就是 `requestedSchema.properties` 的键，类型也是对的——`boolean` → `true`，`array` → `["C-901"]`，`string+enum` → 选项文本。可以直接喂给落地逻辑，不需要二次解析。
  2. **没填的可选字段直接不出现在 `content` 里**（这次没填 `note`，它就没来）。实现时不能假设键齐全，缺键要当"用户没填"而不是"用户填了空"。
  3. `action` 是 `accept`。`decline` / `cancel` 的路径还没走过——取消时 `content` 是 `null` 还是没有，要专门试一次，落地逻辑必须区别对待"用户否决"和"用户没回应"。
- 2026-10-05 · 还欠两条：侧聊里是否同样渲染并回传、面板按钮那条无 turn 的路径。
- 2026-10-05 · **第 1 条不成立——热块不是每轮重读的。** 真机序列：侧聊里调 `align_commit` 落地 C-005（`ALIGNMENT.md` 与 `AGENTS.md` 都写进去了，来源标着"侧聊 · probe_elicit 实测"，`git status` 可见）→ 回到主线程问"现在生效的已确认项有哪些"→ 主 Agent **不调工具**只能说出 C-001 到 C-004。文件跨了回合边界变了，注入到主线程的那份没变。

  旁证：同一实验的相邻两轮里，技能清单从 `0.0.7` 刷成了 `0.0.8`。所以"每轮重注入"这个机制是存在的、也确实在跑，只是 `AGENTS.md` 不参与。

  **后果**：`spec.md` 里"热块每轮自动进入上下文"按字面不成立。侧聊落地的内容不会回到当前线程的上下文，它只对**新会话**生效。这正是产品要解决的那个问题（线程内漂移），所以不能当作"反正是个保底"放过去。

  连带验掉的两条：侧聊能写工作区文件（宿主那句 "unless the user explicitly requests that mutation" 只要用户明确说了就放行）；elicitation 的返回值确实回到了插件自己的进程。

## Answer

三条都问出了答案，而且答案都改了做法（不是"应该可以"）：

1. **主线程不每轮重读 `AGENTS.md`** → 热块的载体换成 `UserPromptSubmit` 钩子现渲染（工单 12、13，C-006）。真机证据：侧聊落地 C-005 后，同一线程里主 Agent 说不出它；技能清单却在相邻两轮里从 0.0.7 刷成 0.0.8，说明"每轮"这个机制本身是成立的。
2. **elicitation 在宿主里能渲染** → 落地 UI 换成原生表单（工单 14、15，C-005、C-012）。
3. **侧聊里同样渲染、同样回传** → 落地不必搬回主线程；2026-10-06 真机走通了"侧聊里一次提交同时落地与复述，主线程下一轮 `restatements=1` 带上一次"。

另外两条悬着的也都有了下文：

- **侧聊回传**：内容不会自己回到主线——这是侧聊能被信任的原因，也决定了"复述"必须落一次盘（收件箱）。
- **无 turn 路径**：面板按钮发起的 `tools/call` 没有 turn，照样成立。2026-10-07 用户在账本面板里改标签、退休、取代，全都写进了文件。

回传形状的结论（`action` + `content`、缺键 = 用户没填、`decline`/`cancel` 与 `accept` 要区别对待）现在活在 `align_land` 的实现里。
