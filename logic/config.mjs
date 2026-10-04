// .align/config.toml 的读取。
//
// 这里只认"顶层键 + [types.<slug>] 段"，够薄闭环用。完整的 TOML 解析留给工单 03，
// 它会连同类型选择一起补齐。任何新类型没写 restate，一律按静默处理——默认值必须是安全的那个。

export const DEFAULT_CONFIG = { hot_block_max_items: 20, types: {} };

function parseValue(raw) {
  const value = raw.replace(/\s+#.*$/, "").trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^"(.*)"$/, "$1");
}

export function parseConfig(text) {
  const config = { hot_block_max_items: DEFAULT_CONFIG.hot_block_max_items, types: {} };
  let section = null;

  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const table = /^\[(.+)\]$/.exec(line);
    if (table) {
      section = table[1];
      if (section.startsWith("types.")) {
        const slug = section.slice("types.".length);
        config.types[slug] ??= {};
      }
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;

    const [, key, rawValue] = pair;
    const value = parseValue(rawValue);

    if (section === null) {
      config[key] = value;
    } else if (section.startsWith("types.")) {
      config.types[section.slice("types.".length)][key] = value;
    }
  }

  return config;
}

/** 类型策略：声明缺失 = 静默。新类型永远不该意外打断用户。 */
export function typePolicy(config, type) {
  const declared = config?.types?.[type];
  return { restate: declared?.restate === true };
}
