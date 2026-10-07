// 落地表单的形状：一条候选 = 两个字段（内容框 + 去哪）。
//
// 放在 logic/ 里是为了**能测**。键名、选项顺序、`enumNames` 与 `enum` 的对齐——这几样
// 错一个，用户的选择就会静默落空（认不出来的目的地会退回 Ignore，点完什么都不会发生）。
//
// 宿主的两条脾气决定了这个形状：
//
// 1. **选择型字段不吃 default。** 初始化表单状态时 string + enum/oneOf/anyOf 一律跳过
//    （app 里的 `vXn`）；default 只对文本、布尔、数字生效。所以"默认停在建议上"只能靠
//    枚举顺序 + 条目描述里的「建议 X」+ 提交时对空值的处理。
// 2. **选项只有 `{const, title}` 两个位置**（app 里的 `gXn`），放不下 hover 说明。
//    所以每个选项的解释并进它的文字里（`enumNames`），表单顶部不再摆图例。
//
// 文本字段反过来是**能吃 default** 的，于是"要带回去的那段"可以预填在一个可编辑框里——
// 用户改它就是改最终写下的措辞。

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
    const choiceKey = `c${index + 1}`;
    const textKey = `t${index + 1}`;
    const suggestion = suggestionSlug(candidate?.destination);
    const type = resolveType(config, candidate?.type ?? fallbackType);
    // 建议的那一项排最前面：宿主若不认 default，枚举的第一项就是落点，效果一样。
    const order = [
      suggestion,
      ...DESTINATIONS.map((entry) => entry.slug).filter((slug) => slug !== suggestion)
    ];

    properties[textKey] = {
      type: "string",
      title: `第 ${index + 1} 条 · 内容（可改）`,
      description: "改它就是改最终写下来的措辞。",
      default: String(candidate?.statement ?? "")
    };

    properties[choiceKey] = {
      type: "string",
      title: `第 ${index + 1} 条 · 去哪`,
      description: `建议 ${destinationLabel(suggestion)} · 标签 ${typeLabel(types, type)}`,
      enum: order.map((slug) => destinationLabel(slug)),
      enumNames: order.map((slug) => destinationChoice(slug)),
      default: destinationLabel(suggestion)
    };

    slots.push({ choiceKey, textKey, candidate, suggestion, type });
  });

  const message = [
    `align：逐条选去哪，共 ${candidates.length} 条。`,
    "没动过的那条按它自己写的建议处理；整张都不想决定就按 Skip，账本不会动。"
  ].join("\n");

  return { message, properties, slots };
}
