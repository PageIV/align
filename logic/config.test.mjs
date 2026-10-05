import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONFIG,
  listTypes,
  parseConfig,
  suggestedType,
  typePolicy
} from "./config.mjs";

const SAMPLE = `
# 类型策略：增删类型只改这里。
hot_block_max_items = 5

[types.concept-alignment]
restate = false

[types.error-correction]
restate = true
`;

test("顶层键与类型段都能读出来", () => {
  const config = parseConfig(SAMPLE);
  assert.equal(config.hot_block_max_items, 5);
  assert.equal(config.types["error-correction"].restate, true);
});

test("没写 restate 的类型一律静默", () => {
  const config = parseConfig(SAMPLE);
  assert.deepEqual(typePolicy(config, "detail-completion"), { restate: false });
});

test("完全未知的类型也静默，不抛错", () => {
  const config = parseConfig(SAMPLE);
  assert.deepEqual(typePolicy(config, "brand-new-type"), { restate: false });
});

test("注释不会被当成值", () => {
  const config = parseConfig('hot_block_max_items = 7 # 上限\n');
  assert.equal(config.hot_block_max_items, 7);
});

test("空输入回落到默认值：上限 + 四个默认类型", () => {
  const config = parseConfig("");
  assert.equal(config.hot_block_max_items, DEFAULT_CONFIG.hot_block_max_items);
  assert.deepEqual(typePolicy(config, "concept-alignment"), { restate: false });
  assert.deepEqual(typePolicy(config, "detail-completion"), { restate: false });
  assert.deepEqual(typePolicy(config, "error-correction"), { restate: true });
  assert.deepEqual(typePolicy(config, "direction-correction"), { restate: true });
});

test("配置能改默认类型的行为", () => {
  const config = parseConfig("[types.concept-alignment]\nrestate = true\n");
  assert.deepEqual(typePolicy(config, "concept-alignment"), { restate: true });
  assert.deepEqual(typePolicy(config, "error-correction"), { restate: true }, "没被点名的类型仍走默认");
});

test("第五类只写在配置里就出现，不写 restate 就是静默", () => {
  const config = parseConfig(`${SAMPLE}\n[types.foo]\nlabel = "新花样"\n`);

  assert.deepEqual(typePolicy(config, "foo"), { restate: false });
  assert.deepEqual(
    listTypes(config).find((type) => type.slug === "foo"),
    { slug: "foo", label: "新花样", restate: false }
  );
});

test("新类型没写 label 时，标签回落成 slug", () => {
  const config = parseConfig("[types.bar]\n");
  assert.equal(listTypes(config).find((type) => type.slug === "bar").label, "bar");
});

test("类型顺序稳定：默认四类在前，新类型按文件顺序追加", () => {
  const config = parseConfig("[types.zed]\n\n[types.alpha]\n");
  const slugs = listTypes(config).map((type) => type.slug);

  assert.deepEqual(slugs.slice(0, 4), [
    "concept-alignment",
    "error-correction",
    "direction-correction",
    "detail-completion"
  ]);
  assert.deepEqual(slugs.slice(-2), ["zed", "alpha"]);
});

test("建议类型就是列表里的第一个", () => {
  const config = parseConfig("");
  assert.equal(suggestedType(config), listTypes(config)[0].slug);
});
