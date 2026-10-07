import assert from "node:assert/strict";
import test from "node:test";

import { parseConfig } from "./config.mjs";
import { buildLandingForm } from "./landing-form.mjs";

const CONFIG = parseConfig("");

function form(candidates) {
  return buildLandingForm(candidates, CONFIG);
}

test("一条候选两个字段：内容框在前，去哪在后", () => {
  const { properties, slots } = form([{ statement: "甲。", destination: "land" }]);

  assert.deepEqual(Object.keys(properties), ["t1", "c1"]);
  assert.deepEqual(
    slots.map((slot) => [slot.textKey, slot.choiceKey]),
    [["t1", "c1"]]
  );
});

test("内容框预填那句话，而且是可改的文本字段", () => {
  const { properties } = form([{ statement: "先别重构。" }]);

  assert.equal(properties.t1.type, "string");
  assert.equal(properties.t1.default, "先别重构。");
  // 选择型字段不许预选（宿主跳过硬编码），文本字段可以——"要复述的内容放进可编辑框"
  // 能成立，靠的就是这一条差别。
  assert.equal(properties.t1.enum, undefined);
});

test("选项文字各自带解释，且与 enum 逐项对齐", () => {
  const { properties } = form([{ statement: "甲。", destination: "restate" }]);
  const choice = properties.c1;

  assert.equal(choice.enum.length, choice.enumNames.length);
  assert.equal(choice.enum[0], "Restate", "建议的那一项排第一");
  choice.enum.forEach((label, index) => {
    assert.ok(
      choice.enumNames[index].startsWith(label),
      `第 ${index} 项的文字要以 ${label} 开头`
    );
  });
});

test("表单顶部不再摆图例", () => {
  const { message } = form([{ statement: "甲。" }]);

  assert.doesNotMatch(message, /Align\s*=/);
  assert.doesNotMatch(message, /Restate\s*=/);
  assert.equal(message.split("\n").length, 2);
});

test("建议写在条目自己的描述里", () => {
  const { properties } = form([
    { statement: "甲。", destination: "land", type: "error-correction" }
  ]);

  assert.match(properties.c1.description, /建议 Align/);
  assert.match(properties.c1.description, /标签 错误纠正/);
});

test("多条候选各占两个字段，编号跟着走", () => {
  const { properties } = form([{ statement: "甲。" }, { statement: "乙。" }]);

  assert.deepEqual(Object.keys(properties), ["t1", "c1", "t2", "c2"]);
  assert.equal(properties.t2.default, "乙。");
});

test("没给建议时落到不落地，选项顺序跟着变", () => {
  const { properties } = form([{ statement: "甲。" }]);
  const choice = properties.c1;

  assert.equal(choice.enum[0], "Ignore");
  assert.equal(choice.default, "Ignore");
  assert.deepEqual(new Set(choice.enum), new Set(["Align", "Restate", "Ignore"]));
});
