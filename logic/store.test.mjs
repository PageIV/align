import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { commitItems, readItems } from "./store.mjs";

const DATE = "2026-10-04";

async function scratchDir() {
  return mkdtemp(join(tmpdir(), "align-store-"));
}

test("第一条落地就长出账本和热块", async () => {
  const root = await scratchDir();
  const { created } = await commitItems(
    root,
    [{ statement: "确认项不含真伪判定。", type: "concept-alignment" }],
    { date: DATE, source: "test" }
  );

  assert.equal(created.length, 1);
  assert.equal(created[0].id, "C-001");

  const ledger = await readFile(join(root, "ALIGNMENT.md"), "utf8");
  assert.match(ledger, /C-001/);

  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- align:begin -->/);
  assert.match(agents, /确认项不含真伪判定。/);
});

test("第二条接着编号，热块跟着更新", async () => {
  const root = await scratchDir();
  await commitItems(root, [{ statement: "第一条。" }], { date: DATE });
  const { created } = await commitItems(root, [{ statement: "第二条。" }], { date: DATE });

  assert.equal(created[0].id, "C-002");

  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.equal(agents.match(/<!-- align:begin -->/g).length, 1);
  assert.match(agents, /第一条。/);
  assert.match(agents, /第二条。/);
});

test("用户自己的 AGENTS.md 内容一个字节不动", async () => {
  const root = await scratchDir();
  const original = "# AGENTS\n\n## Agent skills\n\n用户的内容。\n";
  await writeFile(join(root, "AGENTS.md"), original, "utf8");

  await commitItems(root, [{ statement: "某条。" }], { date: DATE });

  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.ok(agents.startsWith(original.replace(/\s+$/, "")));
  assert.match(agents, /用户的内容。/);
});

test("同一次提交里的多条断言编号连续", async () => {
  const root = await scratchDir();
  const { created } = await commitItems(
    root,
    [{ statement: "甲。" }, { statement: "乙。" }, { statement: "丙。" }],
    { date: DATE }
  );

  assert.deepEqual(created.map((item) => item.id), ["C-001", "C-002", "C-003"]);
  assert.deepEqual((await readItems(root)).map((item) => item.id), ["C-001", "C-002", "C-003"]);
});

test("配置里的上限被遵守", async () => {
  const root = await scratchDir();
  await writeFile(join(root, "ALIGNMENT.md"), "", "utf8");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, ".align"), { recursive: true }));
  await writeFile(join(root, ".align", "config.toml"), "hot_block_max_items = 1\n", "utf8");

  await commitItems(root, [{ statement: "甲。" }, { statement: "乙。" }], { date: DATE });

  const agents = await readFile(join(root, "AGENTS.md"), "utf8");
  assert.equal(agents.match(/^- \[C-/gm).length, 1);
});
