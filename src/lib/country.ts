/** Canonical country keys for ME-focused coverage maps and CRM alias matching. */

export const COUNTRY_ALIAS_GROUPS: string[][] = [
  ["saudi arabia", "ksa", "saudi", "沙特", "沙特阿拉伯", "riyadh", "利雅得", "jeddah", "吉达", "dammam", "达曼"],
  ["united arab emirates", "uae", "emirates", "阿联酋", "阿拉伯联合酋长国", "dubai", "迪拜", "abu dhabi", "阿布扎比"],
  ["qatar", "qat", "卡塔尔", "doha", "多哈"],
  ["bahrain", "bhr", "巴林", "manama", "麦纳麦"],
  ["kuwait", "kwt", "科威特"],
  ["oman", "omn", "阿曼", "muscat", "马斯喀特"],
  ["egypt", "egy", "埃及", "cairo", "开罗"],
  ["jordan", "jor", "约旦", "amman", "安曼"],
  ["lebanon", "lbn", "黎巴嫩", "beirut", "贝鲁特"],
  ["iraq", "irq", "伊拉克", "baghdad", "巴格达"],
  ["iran", "irn", "伊朗", "tehran", "德黑兰"],
  ["turkey", "turkiye", "türkiye", "土耳其", "istanbul", "伊斯坦布尔", "ankara", "安卡拉"],
  ["israel", "isr", "以色列", "tel aviv", "特拉维夫"],
  ["palestine", "pse", "巴勒斯坦"],
  ["yemen", "yem", "也门"],
  ["syria", "syr", "叙利亚"],
  ["kazakhstan", "kaz", "哈萨克斯坦", "қазақстан"],
  ["pakistan", "pak", "巴基斯坦"],
  ["afghanistan", "afg", "阿富汗"],
  ["morocco", "mar", "摩洛哥"],
  ["algeria", "dza", "阿尔及利亚"],
  ["tunisia", "tun", "突尼斯"],
  ["libya", "lby", "利比亚"],
  ["sudan", "sdn", "苏丹"],
];

/** Stable codes used as coverage-map row keys (order = display order). */
export const FOCUS_COUNTRY_CODES = [
  "SAUDI_ARABIA",
  "UAE",
  "QATAR",
  "BAHRAIN",
  "KUWAIT",
  "OMAN",
  "EGYPT",
  "JORDAN",
  "LEBANON",
  "IRAQ",
  "IRAN",
  "TURKEY",
  "ISRAEL",
  "PALESTINE",
  "YEMEN",
  "SYRIA",
  "KAZAKHSTAN",
  "PAKISTAN",
  "AFGHANISTAN",
  "MOROCCO",
  "ALGERIA",
  "TUNISIA",
  "LIBYA",
  "SUDAN",
] as const;

export type FocusCountryCode = (typeof FOCUS_COUNTRY_CODES)[number];
export const UNKNOWN_COUNTRY_CODE = "UNKNOWN";

const GROUP_TO_CODE: FocusCountryCode[] = [...FOCUS_COUNTRY_CODES];

const zhCountryLabels: Record<FocusCountryCode | typeof UNKNOWN_COUNTRY_CODE, string> = {
  SAUDI_ARABIA: "沙特",
  UAE: "阿联酋",
  QATAR: "卡塔尔",
  BAHRAIN: "巴林",
  KUWAIT: "科威特",
  OMAN: "阿曼",
  EGYPT: "埃及",
  JORDAN: "约旦",
  LEBANON: "黎巴嫩",
  IRAQ: "伊拉克",
  IRAN: "伊朗",
  TURKEY: "土耳其",
  ISRAEL: "以色列",
  PALESTINE: "巴勒斯坦",
  YEMEN: "也门",
  SYRIA: "叙利亚",
  KAZAKHSTAN: "哈萨克斯坦",
  PAKISTAN: "巴基斯坦",
  AFGHANISTAN: "阿富汗",
  MOROCCO: "摩洛哥",
  ALGERIA: "阿尔及利亚",
  TUNISIA: "突尼斯",
  LIBYA: "利比亚",
  SUDAN: "苏丹",
  UNKNOWN: "其他 / 未知",
};

const enCountryLabels: Record<FocusCountryCode | typeof UNKNOWN_COUNTRY_CODE, string> = {
  SAUDI_ARABIA: "Saudi Arabia",
  UAE: "UAE",
  QATAR: "Qatar",
  BAHRAIN: "Bahrain",
  KUWAIT: "Kuwait",
  OMAN: "Oman",
  EGYPT: "Egypt",
  JORDAN: "Jordan",
  LEBANON: "Lebanon",
  IRAQ: "Iraq",
  IRAN: "Iran",
  TURKEY: "Turkey",
  ISRAEL: "Israel",
  PALESTINE: "Palestine",
  YEMEN: "Yemen",
  SYRIA: "Syria",
  KAZAKHSTAN: "Kazakhstan",
  PAKISTAN: "Pakistan",
  AFGHANISTAN: "Afghanistan",
  MOROCCO: "Morocco",
  ALGERIA: "Algeria",
  TUNISIA: "Tunisia",
  LIBYA: "Libya",
  SUDAN: "Sudan",
  UNKNOWN: "Other / Unknown",
};

export function normalizeCountryKey(
  country?: string | null,
  city?: string | null,
): FocusCountryCode | typeof UNKNOWN_COUNTRY_CODE {
  const raw = [country, city].filter(Boolean).join(" / ").trim();
  if (!raw) return UNKNOWN_COUNTRY_CODE;
  const lower = raw.toLowerCase();
  for (let i = 0; i < COUNTRY_ALIAS_GROUPS.length; i++) {
    const group = COUNTRY_ALIAS_GROUPS[i];
    if (group.some((a) => lower.includes(a.toLowerCase()))) {
      return GROUP_TO_CODE[i] ?? UNKNOWN_COUNTRY_CODE;
    }
  }
  return UNKNOWN_COUNTRY_CODE;
}

export function countryLabel(code: string, locale: "zh" | "en" = "zh"): string {
  const map = locale === "zh" ? zhCountryLabels : enCountryLabels;
  return map[code as keyof typeof map] ?? code;
}

export function buildCountryAliases(country?: string | null, city?: string | null): string[] {
  const raw = [country, city].filter(Boolean).join(" / ");
  if (!raw.trim()) return [];

  const aliases = new Set<string>();
  for (const part of raw.split(/[/|,;]+/).map((s) => s.trim()).filter(Boolean)) {
    aliases.add(part);
  }

  const lower = raw.toLowerCase();
  for (const group of COUNTRY_ALIAS_GROUPS) {
    if (group.some((a) => lower.includes(a.toLowerCase()))) {
      for (const a of group) aliases.add(a);
    }
  }
  return [...aliases];
}
