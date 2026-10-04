import assert from "node:assert/strict";
import test from "node:test";

import { renderHotBlock, readHotBlock, upsertHotBlock } from "./hot-block.mjs";

const ITEMS = [
  {
    id: "C-001",
    type: "concept-alignment",
    date: "2026-10-04",
    statement: "确认项指的是我们同意这么说。",
    source: "s",
    status: "active"
  },
  {
    id: "C-002",
    type: "error-correction",
    date: "2026-10-04",
    statement: "端口是 8080，不是 3000。",
    source: "s",
    status: "superseded by C-003"
  }
];

test("热块只装生效中的条目", () => {
  const block = renderHotBlock(ITEMS);
  assert.match(block, /C-001/);
  assert.doesNotMatch(block, /C-002/);
});

test("超过上限时截断，账本不受影响", () => {
  const many = Array.from({ length: 5 }, (_, index) => ({
    ...ITEMS[0],
    id: `C-10${index}`,
    statement: `第 ${index} 条`
  }));
  const block = renderHotBlock(many, { maxItems: 2 });
  assert.equal(block.match(/^- \[C-/gm).length, 2);
  assert.equal(readHotBlock(block).startsWith("<!-- align:begin -->"), true);
});

test("文件里没有区块时追加到末尾，并保留原有内容", () => {
  const original = "# AGENTS\n\n## Agent skills\n\n这里是用户自己的内容。\n";
  const result = upsertHotBlock(original, renderHotBlock(ITEMS));

  assert.match(result, /这里是用户自己的内容。/);
  assert.ok(result.indexOf("这里是用户自己的内容。") < result.indexOf("<!-- align:begin -->"));
  assert.ok(result.endsWith("<!-- align:end -->\n"));
});

test("文件里有区块时就地替换，不追加第二份", () => {
  const first = upsertHotBlock("# AGENTS\n", renderHotBlock(ITEMS));
  const second = upsertHotBlock(first, renderHotBlock([{ ...ITEMS[0], statement: "改过的断言。" }]));

  assert.equal(second.match(/<!-- align:begin -->/g).length, 1);
  assert.match(second, /改过的断言。/);
  assert.doesNotMatch(second, /我们同意这么说/);
});

test("幂等：同样的 block 写两次，字节一致", () => {
  const once = upsertHotBlock("# AGENTS\n", renderHotBlock(ITEMS));
  const twice = upsertHotBlock(once, renderHotBlock(ITEMS));
  assert.equal(twice, once);
});

test("空文件也能长出区块", () => {
  const result = upsertHotBlock("", renderHotBlock(ITEMS));
  assert.ok(result.startsWith("<!-- align:begin -->"));
  assert.equal(upsertHotBlock(result, renderHotBlock(ITEMS)), result);
});

test("返回 null 而不是抛错，当文件里没有区块", () => {
  assert.equal(readHotBlock("# 什么都没有\n"), null);
});
