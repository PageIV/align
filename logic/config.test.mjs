import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CONFIG, parseConfig, typePolicy } from "./config.mjs";

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

test("空输入回落到默认值", () => {
  const config = parseConfig("");
  assert.equal(config.hot_block_max_items, DEFAULT_CONFIG.hot_block_max_items);
  assert.deepEqual(config.types, {});
});
