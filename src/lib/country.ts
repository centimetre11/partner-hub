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

/** Major cities for each focus country (form dropdown options). */
export const COUNTRY_CITIES: Record<FocusCountryCode, { zh: string; en: string }[]> = {
  SAUDI_ARABIA: [
    { zh: "利雅得", en: "Riyadh" },
    { zh: "吉达", en: "Jeddah" },
    { zh: "达曼", en: "Dammam" },
    { zh: "麦加", en: "Mecca" },
    { zh: "麦地那", en: "Medina" },
    { zh: "海尔", en: "Khobar" },
    { zh: "塔伊夫", en: "Taif" },
  ],
  UAE: [
    { zh: "迪拜", en: "Dubai" },
    { zh: "阿布扎比", en: "Abu Dhabi" },
    { zh: "沙迦", en: "Sharjah" },
    { zh: "阿治曼", en: "Ajman" },
    { zh: "拉斯海马", en: "Ras Al Khaimah" },
    { zh: "富查伊拉", en: "Fujairah" },
    { zh: "乌姆盖万", en: "Umm Al Quwain" },
  ],
  QATAR: [
    { zh: "多哈", en: "Doha" },
    { zh: "卢赛尔", en: "Lusail" },
    { zh: "沃克拉", en: "Al Wakrah" },
    { zh: "赖扬", en: "Al Rayyan" },
  ],
  BAHRAIN: [
    { zh: "麦纳麦", en: "Manama" },
    { zh: "穆哈拉格", en: "Muharraq" },
    { zh: "里法", en: "Riffa" },
  ],
  KUWAIT: [
    { zh: "科威特城", en: "Kuwait City" },
    { zh: "哈瓦利", en: "Hawalli" },
    { zh: "艾哈迈迪", en: "Al Ahmadi" },
  ],
  OMAN: [
    { zh: "马斯喀特", en: "Muscat" },
    { zh: "塞拉莱", en: "Salalah" },
    { zh: "苏哈尔", en: "Sohar" },
  ],
  EGYPT: [
    { zh: "开罗", en: "Cairo" },
    { zh: "亚历山大", en: "Alexandria" },
    { zh: "吉萨", en: "Giza" },
    { zh: "塞得港", en: "Port Said" },
  ],
  JORDAN: [
    { zh: "安曼", en: "Amman" },
    { zh: "亚喀巴", en: "Aqaba" },
    { zh: "伊尔比德", en: "Irbid" },
  ],
  LEBANON: [
    { zh: "贝鲁特", en: "Beirut" },
    { zh: "的黎波里", en: "Tripoli" },
    { zh: "西顿", en: "Sidon" },
  ],
  IRAQ: [
    { zh: "巴格达", en: "Baghdad" },
    { zh: "巴士拉", en: "Basra" },
    { zh: "埃尔比勒", en: "Erbil" },
  ],
  IRAN: [
    { zh: "德黑兰", en: "Tehran" },
    { zh: "伊斯法罕", en: "Isfahan" },
    { zh: "设拉子", en: "Shiraz" },
  ],
  TURKEY: [
    { zh: "伊斯坦布尔", en: "Istanbul" },
    { zh: "安卡拉", en: "Ankara" },
    { zh: "伊兹密尔", en: "Izmir" },
    { zh: "安塔利亚", en: "Antalya" },
  ],
  ISRAEL: [
    { zh: "特拉维夫", en: "Tel Aviv" },
    { zh: "耶路撒冷", en: "Jerusalem" },
    { zh: "海法", en: "Haifa" },
  ],
  PALESTINE: [
    { zh: "拉姆安拉", en: "Ramallah" },
    { zh: "加沙", en: "Gaza" },
    { zh: "希伯伦", en: "Hebron" },
  ],
  YEMEN: [
    { zh: "萨那", en: "Sanaa" },
    { zh: "亚丁", en: "Aden" },
  ],
  SYRIA: [
    { zh: "大马士革", en: "Damascus" },
    { zh: "阿勒颇", en: "Aleppo" },
  ],
  KAZAKHSTAN: [
    { zh: "阿斯塔纳", en: "Astana" },
    { zh: "阿拉木图", en: "Almaty" },
    { zh: "奇姆肯特", en: "Shymkent" },
  ],
  PAKISTAN: [
    { zh: "卡拉奇", en: "Karachi" },
    { zh: "拉合尔", en: "Lahore" },
    { zh: "伊斯兰堡", en: "Islamabad" },
  ],
  AFGHANISTAN: [
    { zh: "喀布尔", en: "Kabul" },
    { zh: "坎大哈", en: "Kandahar" },
  ],
  MOROCCO: [
    { zh: "卡萨布兰卡", en: "Casablanca" },
    { zh: "拉巴特", en: "Rabat" },
    { zh: "马拉喀什", en: "Marrakech" },
  ],
  ALGERIA: [
    { zh: "阿尔及尔", en: "Algiers" },
    { zh: "奥兰", en: "Oran" },
  ],
  TUNISIA: [
    { zh: "突尼斯市", en: "Tunis" },
    { zh: "斯法克斯", en: "Sfax" },
  ],
  LIBYA: [
    { zh: "的黎波里", en: "Tripoli" },
    { zh: "班加西", en: "Benghazi" },
  ],
  SUDAN: [
    { zh: "喀土穆", en: "Khartoum" },
    { zh: "奥姆杜尔曼", en: "Omdurman" },
  ],
};

export const CUSTOM_LOCATION_VALUE = "__custom__";

export function countryOptions(locale: "zh" | "en" = "zh"): { code: FocusCountryCode; label: string }[] {
  return FOCUS_COUNTRY_CODES.map((code) => ({
    code,
    label: countryLabel(code, locale),
  }));
}

export function cityOptions(
  countryCode: FocusCountryCode | typeof UNKNOWN_COUNTRY_CODE | "",
  locale: "zh" | "en" = "zh",
): string[] {
  if (!countryCode || countryCode === UNKNOWN_COUNTRY_CODE) return [];
  return (COUNTRY_CITIES[countryCode] ?? []).map((c) => (locale === "zh" ? c.zh : c.en));
}

/** Resolve a stored country string to a focus code, or custom if unmatched. */
export function resolveCountrySelection(country?: string | null): {
  code: FocusCountryCode | typeof CUSTOM_LOCATION_VALUE | "";
  custom: string;
} {
  const raw = country?.trim() ?? "";
  if (!raw) return { code: "", custom: "" };
  const code = normalizeCountryKey(raw);
  if (code !== UNKNOWN_COUNTRY_CODE) {
    return { code, custom: "" };
  }
  return { code: CUSTOM_LOCATION_VALUE, custom: raw };
}

/** Resolve a stored city against builtin options for a country. */
export function resolveCitySelection(
  city: string | null | undefined,
  countryCode: FocusCountryCode | typeof CUSTOM_LOCATION_VALUE | "",
  locale: "zh" | "en" = "zh",
): { value: string; custom: string } {
  const raw = city?.trim() ?? "";
  if (!raw) return { value: "", custom: "" };
  if (!countryCode || countryCode === CUSTOM_LOCATION_VALUE) {
    return { value: CUSTOM_LOCATION_VALUE, custom: raw };
  }
  const cities = COUNTRY_CITIES[countryCode] ?? [];
  const lower = raw.toLowerCase();
  const matched = cities.find(
    (c) => c.zh === raw || c.en.toLowerCase() === lower,
  );
  if (matched) {
    return { value: locale === "zh" ? matched.zh : matched.en, custom: "" };
  }
  return { value: CUSTOM_LOCATION_VALUE, custom: raw };
}
