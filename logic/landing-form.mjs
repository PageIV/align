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
    // 建议的那一项排最前面：宿主若不认 default，枚举的第一项就是落点，效果一样。
    const order = [
      suggestion,
      ...DESTINATIONS.map((entry) => entry.slug).filter((slug) => slug !== suggestion)
    ];

    properties[key] = {
      type: "string",
      // 那句话就是这一页的问题：用户在同一页上既能读到它，也能选它去哪。
      title: String(candidate?.statement ?? ""),
      description: `第 ${index + 1} 条 · 建议 ${destinationLabel(suggestion)} · 标签 ${typeLabel(types, type)}`,
      enum: order.map((slug) => destinationLabel(slug)),
      enumNames: order.map((slug) => destinationChoice(slug)),
      default: destinationLabel(suggestion)
    };

    slots.push({ key, candidate, suggestion, type });
  });

  // 表单顶部**不写字**：向导会把它钉在每一页上头，而它要说的事（建议、Skip）在别处都有。
  // message 是必填字段，所以给空串，不是省略。
  return { message: "", properties, slots };
}
