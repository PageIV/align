import assert from "node:assert/strict";
import test from "node:test";

import { parseConfig } from "./config.mjs";
import { buildLandingForm } from "./landing-form.mjs";

const CONFIG = parseConfig("");

function form(candidates) {
  return buildLandingForm(candidates, CONFIG);
}

test("一条候选一个字段——向导一问一页，两个字段就是两页", () => {
  const { properties, slots } = form([{ statement: "甲。", destination: "land" }]);

  assert.deepEqual(Object.keys(properties), ["c1"]);
  assert.deepEqual(slots.map((slot) => slot.key), ["c1"]);
});

test("那句话就是那一页的问题文字——它得和选项在同一页上", () => {
  const { properties } = form([{ statement: "先别重构。" }]);

  assert.equal(properties.c1.title, "先别重构。");
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

test("顶部只留一行标题：没有说明书，但也不能空着", () => {
  assert.equal(form([{ statement: "甲。" }]).message, "这条去哪？");
  assert.equal(form([{ statement: "甲。" }, { statement: "乙。" }]).message, "逐条选去哪");
});

test("顶部那行不带说明书——建议在描述里、进度由向导自己写", () => {
  const { message } = form([{ statement: "甲。" }, { statement: "乙。" }]);

  assert.doesNotMatch(message, /描述里写着/);
  assert.doesNotMatch(message, /共\s*\d+\s*条/);
  assert.doesNotMatch(message, /Skip/);
});

test("建议写在条目自己的描述里", () => {
  const { properties } = form([
    { statement: "甲。", destination: "land", type: "error-correction" }
  ]);

  assert.match(properties.c1.description, /建议 Align/);
  assert.match(properties.c1.description, /标签 错误纠正/);
  // 只有一条候选时"第 1 条"是废话——它就在唯一那一页上。
  assert.doesNotMatch(properties.c1.description, /第 1 条/);
});

test("多条候选才编号", () => {
  const { properties } = form([{ statement: "甲。" }, { statement: "乙。" }]);

  assert.match(properties.c2.description, /^第 2 条 · 建议/);
});

test("多条候选各占一个字段，编号跟着走", () => {
  const { properties } = form([{ statement: "甲。" }, { statement: "乙。" }]);

  assert.deepEqual(Object.keys(properties), ["c1", "c2"]);
  assert.equal(properties.c2.title, "乙。");
});

test("没给建议时落到不落地，选项顺序跟着变", () => {
  const { properties } = form([{ statement: "甲。" }]);
  const choice = properties.c1;

  assert.equal(choice.enum[0], "Ignore");
  assert.equal(choice.default, "Ignore");
  assert.deepEqual(new Set(choice.enum), new Set(["Align", "Restate", "Ignore"]));
});
