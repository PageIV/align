// .align/config.toml 的读取。
//
// 类型是开放集合：增删类型只改配置，不改代码。所以下面这张默认值表是**唯一**允许出现
// 类型 slug 的地方——logic/no-hardcoded-types.test.mjs 盯着这一条。
//
// 只认"顶层键 + [types.<slug>] 段"，够薄闭环用。任何没写 restate 的类型一律按静默处理，
// 默认值必须是安全的那个。

/** 出厂默认类型表。顺序就是面板里的展示顺序。 */
export const DEFAULT_TYPES = [
  { slug: "concept-alignment", label: "概念对齐", restate: false },
  { slug: "error-correction", label: "错误纠正", restate: true },
  { slug: "direction-correction", label: "方向纠偏", restate: true },
  { slug: "detail-completion", label: "细节填充", restate: false }
];

export const DEFAULT_CONFIG = { hot_block_max_items: 20, types: {} };

/** 每类条目落地后的行为。配置里没声明的类型一律静默。 */
export function typePolicy(config, type) {
  return { restate: config?.types?.[type]?.restate === true };
}

/** 面板要的类型列表。顺序稳定，标签回落成 slug。 */
export function listTypes(config) {
  return Object.entries(config?.types ?? {}).map(([slug, entry]) => ({
    slug,
    label: entry?.label ?? slug,
    restate: entry?.restate === true
  }));
}

/** 建议类型：列表里的第一个。 */
export function suggestedType(config) {
  return listTypes(config)[0]?.slug;
}

/** 出厂配置：默认类型先铺进 types，配置文件再往上盖。 */
export function defaultConfig() {
  const types = {};
  for (const { slug, ...rest } of DEFAULT_TYPES) types[slug] = { ...rest };
  return { hot_block_max_items: DEFAULT_CONFIG.hot_block_max_items, types };
}

function parseValue(raw) {
  const value = raw.replace(/\s+#.*$/, "").trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^"(.*)"$/, "$1");
}

export function parseConfig(text) {
  const config = defaultConfig();
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
