// 三个目的地：用户对每条候选断言唯一要判断的事，是"这段东西去哪"。
//
// - Align（落地）：写进 ALIGNMENT.md，之后每轮注入，直到退休。长期的约定、定义、边界用它。
// - Restate（复述）：进收件箱，交给主线的下一次提问说一次。用完一次就失效的内容用它——
//   命令式的要求、够不上一条已确认项的片段。
// - Ignore（不落地）：不留痕。一次给多条候选时，用户需要能逐条丢掉其中几条，而不是
//   为了丢掉一条把整张表单取消掉。
//
// 表单自带的 skip 按钮是另一回事：那是"整张表单我都不想决定"，不是逐条丢弃。
//
// 表单上显示英文（宿主原生表单的按钮本来就是英文）；中文文档里仍叫"落地"与"复述"。
// 类型不在其中：类型退化成标签（工单 15），由模型在背后给出，不再让用户选。

export const DESTINATIONS = [
  { slug: "land", label: "Align", hint: "写进 ALIGNMENT.md，之后每轮都带上。" },
  { slug: "restate", label: "Restate", hint: "只把这段带回主线说一次，不进账本。" },
  { slug: "ignore", label: "Ignore", hint: "不留痕，这条不写任何文件。" }
];

/**
 * 认不出来时的落点。猜不出来就不能让一条断言悄悄进账本（它会每轮都出现），所以兜底是
 * 唯一不留痕的那一项。
 */
export const DEFAULT_DESTINATION = "ignore";

const FALLBACK = DESTINATIONS.find((entry) => entry.slug === DEFAULT_DESTINATION);

/** slug → 表单上的标签。认不出来的一律按兜底。 */
export function destinationLabel(slug) {
  return (DESTINATIONS.find((entry) => entry.slug === slug) ?? FALLBACK).label;
}

/** 表单上选的标签 → slug。认不出来的一律按兜底。 */
export function destinationSlug(label) {
  return DESTINATIONS.find((entry) => entry.label === label)?.slug ?? DEFAULT_DESTINATION;
}

/**
 * 模型给的建议目的地 → slug。
 * 模型写 slug 或写标签都认；写别的（或干脆没写）就退回兜底。
 */
export function suggestionSlug(value) {
  const text = String(value ?? "").trim();
  const bySlug = DESTINATIONS.find((entry) => entry.slug === text);
  const byLabel = DESTINATIONS.find((entry) => entry.label === text);
  return bySlug?.slug ?? byLabel?.slug ?? DEFAULT_DESTINATION;
}
