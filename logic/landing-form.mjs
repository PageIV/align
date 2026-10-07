// 落地表单的形状：**一条候选 = 一个字段**。
//
// 放在 logic/ 里是为了**能测**。键名、选项顺序、`enumNames` 与 `enum` 的对齐——这几样
// 错一个，用户的选择就会静默落空（认不出来的目的地会退回 Ignore，点完什么都不会发生）。
//
// 宿主的形态决定了这个形状：
//
// 1. **一问一页的分步向导。** elicitation 表单按**字段**翻页（app 里的 i18n 有
//    `mcpFormElicitation.next` / `.continue` / `.progress` / `.skipQuestion`）。所以
//    "一个字段里同时给出可编辑文本和几个选项"做不到——两个字段就是两页，用户得先翻过
//    一页才能选。2026-10-07 试过两字段的版本，被用户当场否掉。
// 2. **选择型字段不吃 default。** 初始化状态时 string + enum/oneOf/anyOf 一律跳过
//    （app 里的 `vXn`）；default 只对文本、布尔、数字生效。所以"默认停在建议上"只能靠
//    枚举顺序 + 条目描述里的「建议 X」+ 提交时对空值的处理。
// 3. **选项只有 `{const, title}` 两个位置**（app 里的 `gXn`），放不下 hover 说明。
//    所以每个选项的解释并进它的文字里（`enumNames`），表单顶部不再摆图例。
//
// 于是那条候选句子只能回到**字段标题**上——它和选项在同一页，这是它唯一的去处。
// 想改措辞，落地之后在账本面板里点「改」（走取代）——那里才是改文字的地方。

import { listTypes, resolveType, suggestedType, typeLabel } from "./config.mjs";
import {
  DESTINATIONS,
  destinationChoice,
  destinationLabel,
  destinationSlug,
  suggestionSlug
} from "./destination.mjs";

export function buildLandingForm(candidates, config) {
  const types = listTypes(config);
  const fallbackType = suggestedType(config);
  const properties = {};
  const slots = [];

  candidates.forEach((candidate, index) => {
    const key = `c${index + 1}`;
    const suggestion = suggestionSlug(candidate?.destination);
    const type = resolveType(config, candidate?.type ?? fallbackType);
    // 只有一条候选时"第 1 条"是废话——它就在唯一那一页上。
    const prefix = candidates.length > 1 ? `第 ${index + 1} 条 · ` : "";
    // 建议的那一项排最前面：宿主若不认 default，枚举的第一项就是落点，效果一样。
    const order = [
      suggestion,
      ...DESTINATIONS.map((entry) => entry.slug).filter((slug) => slug !== suggestion)
    ];

    properties[key] = {
      type: "string",
      // 那句话就是这一页的问题：用户在同一页上既能读到它，也能选它去哪。
      title: String(candidate?.statement ?? ""),
      description: `${prefix}建议 ${destinationLabel(suggestion)} · 标签 ${typeLabel(types, type)}`,
      enum: order.map((slug) => destinationLabel(slug)),
      enumNames: order.map((slug) => destinationChoice(slug)),
      default: destinationLabel(suggestion)
    };

    slots.push({ key, candidate, suggestion, type });
  });

  // 表单顶部**只留一行标题**，不是说明书：
  //
  // - 那段"每条的描述里写着它自己的建议……"是废话——建议就在每条的描述里；"共 N 条"
  //   也多余，向导自己写着 `{current} of {total}`。2026-10-07 用户点名要去掉。
  // - 但顶部**不能是空的**：这一段就是表单那张卡的头部，清空之后问题文字直接贴到框顶，
  //   一条候选时尤其明显（"文字太靠上"）。标题只干一件事——把内容压下去一格、给卡片
  //   一个头。
  //
  // message 是必填字段（宿主 schema 里没有 optional），所以永远给一个非空值。
  const message = candidates.length === 1 ? "这条去哪？" : "逐条选去哪";

  return { message, properties, slots };
}
/**
 * 表单回传 → 决定：哪几条落地、哪几条复述。
 *
 * 两种"没动过"要分清：
 * - 选择型字段**没有**回传这个 key（宿主不预选，见 buildLandingForm 的说明）→ 按建议走。
 * - 回传了一个认不出来的值 → 退回 Ignore：少留痕比多留痕安全，而且 Ignore 是唯一
 *   "点错了也看不出代价"的落点（destination.mjs 里写的兜底逻辑）。
 */
export function readLandingAnswers(slots, content) {
  const chosen = [];
  const restatements = [];

  for (const { key, candidate, suggestion, type } of slots) {
    const raw = content?.[key];
    const picked = typeof raw === "string" && raw.trim() ? raw.trim() : destinationLabel(suggestion);
    const destination = destinationSlug(picked);
    const statement = String(candidate?.statement ?? "");

    if (destination === "land") {
      chosen.push({
        statement,
        type,
        supersedes: typeof candidate?.supersedes === "string" ? candidate.supersedes.trim() : ""
      });
    } else if (destination === "restate") {
      restatements.push(statement);
    }
  }

  return { chosen, restatements };
}
