import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DEFAULT_TYPES } from "./config.mjs";

// 工单 03 的验收标准 3：四个 slug 只允许出现在默认值表里。
// 类型是开放集合——增删类型只改 .align/config.toml，不改代码。有测试盯着。

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS_FILE = join("logic", "config.mjs");

async function sourceFiles() {
  const files = [];

  for (const dir of ["logic", "mcp", "ui"]) {
    for (const name of await readdir(join(REPO, dir))) {
      if (name.endsWith(".test.mjs")) continue;
      if (!name.endsWith(".mjs") && !name.endsWith(".html")) continue;
      files.push(join(dir, name));
    }
  }

  return files;
}

test("四个 slug 只出现在默认值表里", async () => {
  const offenders = [];

  for (const file of await sourceFiles()) {
    const source = await readFile(join(REPO, file), "utf8");
    for (const { slug } of DEFAULT_TYPES) {
      if (file !== DEFAULTS_FILE && source.includes(slug)) {
        offenders.push(`${file} 里出现了 ${slug}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
