import { normalizeActionText } from "./intake-action-registry";

/** Entity the user was just viewing — used for follow-up patch commands. */
export type FocusEntityKind = "todo" | "opportunity" | "business_record" | "partner" | "contact";

export type FocusListItem = {
  id: string;
  label: string;
};

export type FocusEntity = {
  kind: FocusEntityKind;
  /** Primary target when unambiguous */
  id?: string;
  label: string;
  partnerId?: string;
  partnerName?: string;
  /** When a list was shown — for disambiguation */
  listItems?: FocusListItem[];
  updatedAt: number;
};

export type FocusPatchTarget = {
  id: string;
  label: string;
  instruction: string;
};

const FOCUS_TTL_MS = 30 * 60 * 1000;

const CN_INDEX: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** Modification verbs — not create */
export const MODIFICATION_PHRASE_RE =
  /改成|改为|改成|更新|修改|调整|换成|设为|设置为|改一下|改下|延后|推迟|延期|标记.{0,4}完成|已完成|完成|done|postpone|complete|mark.{0,6}done|change to|update to|set to|modify|assign/i;

/** Field-level hints often used in patch follow-ups */
export const PATCH_FIELD_HINT_RE =
  /责任人|负责人|assignee|截止|到期|due|阶段|stage|金额|amount|优先级|priority|标题|title|状态|status|next step|下一步/i;

/** Explicit create verbs — should NOT route to patch even with focus */
export const CREATE_VERB_RE =
  /^(建|创建|新建|加|添加|录入|记一|log|create|add|new)\b|建.{0,4}待办|创建待办|添加商机|记.{0,4}商务|新建商机/i;

export function parseListIndex(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (CN_INDEX[t] != null) return CN_INDEX[t];
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

function parseOrdinalSegment(segment: string): { index: number; instruction: string } | null {
  const t = segment.trim();
  const m =
    t.match(/^第([一二三四五六七八九十\d]+)条(?:待办)?(.+)$/) ??
    t.match(/^待办\s*([一二三四五六七八九十\d]+)(.+)$/);
  if (!m) return null;
  const index = parseListIndex(m[1]);
  if (!index) return null;
  const instruction = m[2].trim().replace(/^待办/, "").trim();
  if (!instruction) return null;
  return { index, instruction };
}

export function isModificationPhrase(text: string): boolean {
  const t = normalizeActionText(text);
  if (!t || CREATE_VERB_RE.test(t)) return false;
  return MODIFICATION_PHRASE_RE.test(t) || PATCH_FIELD_HINT_RE.test(t);
}

export function isCreatePhrase(text: string): boolean {
  return CREATE_VERB_RE.test(normalizeActionText(text));
}

export function focusIsFresh(focus: FocusEntity | undefined | null): focus is FocusEntity {
  if (!focus) return false;
  return Date.now() - focus.updatedAt < FOCUS_TTL_MS;
}

export function patchActionIdForKind(kind: FocusEntityKind): string {
  return `patch.${kind}`;
}

export function focusKindFromPatchActionId(actionId: string): FocusEntityKind | undefined {
  const m = actionId.match(/^patch\.(todo|opportunity|business_record|partner|contact)$/);
  return m ? (m[1] as FocusEntityKind) : undefined;
}

/** Resolve which list item the user means (default: sole item). */
export function resolveFocusTarget(
  focus: FocusEntity,
  text: string
): { id: string; label: string } | { ambiguous: FocusListItem[] } | null {
  if (focus.id && focus.label) {
    return { id: focus.id, label: focus.label };
  }
  const items = focus.listItems ?? [];
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const t = normalizeActionText(text);
  const num = t.match(/^([1-9])$/);
  if (num) {
    const pick = items.find((_, i) => i + 1 === Number(num[1]));
    if (pick) return pick;
  }

  const ord =
    t.match(/^(?:第([一二三四五六七八九十\d]+)条(?:待办)?|待办\s*([一二三四五六789\d]+))/) ??
    t.match(/(?:^|[，,；;]\s*)(?:第([一二三四五六789\d]+)条(?:待办)?|待办\s*([一二三四五六789\d]+))/);
  if (ord) {
    const index = parseListIndex(ord[1] || ord[2] || "");
    if (index && items[index - 1]) return items[index - 1];
  }

  for (const item of items) {
    if (t.includes(item.label.slice(0, 12))) return item;
  }
  return { ambiguous: items };
}

/** Parse one or more patch targets from a compound instruction (e.g. 第二条延后，第一条完成). */
export function resolveFocusPatchTargets(
  focus: FocusEntity,
  text: string
): FocusPatchTarget[] | { ambiguous: FocusListItem[] } | null {
  const items = focus.listItems ?? [];
  if (focus.id && focus.label && !items.length) {
    return [{ id: focus.id, label: focus.label, instruction: normalizeActionText(text) }];
  }
  if (!items.length) return null;

  const normalized = normalizeActionText(text);
  const segments = normalized.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean);
  const patches: FocusPatchTarget[] = [];

  for (const seg of segments) {
    const parsed = parseOrdinalSegment(seg);
    if (!parsed) continue;
    const item = items[parsed.index - 1];
    if (!item) continue;
    patches.push({ id: item.id, label: item.label, instruction: parsed.instruction });
  }

  if (patches.length > 0) return patches;

  const single = resolveFocusTarget(focus, text);
  if (!single) return null;
  if ("ambiguous" in single) return single;
  return [{ id: single.id, label: single.label, instruction: normalized }];
}

/** Parse list_todos / list_opportunities tool output lines with [id:…] prefix. */
export function extractListItemsFromFormattedReply(reply: string): FocusListItem[] {
  const items: FocusListItem[] = [];
  for (const line of reply.split("\n")) {
    const m = line.match(/^\[id:([^\]]+)\]\s*(?:\[[^\]]+\]\s*)?(.+?)(?:\s*\||$)/);
    if (m) {
      items.push({ id: m[1], label: m[2].trim() });
    }
  }
  return items;
}

export function buildFocusFromListItems(opts: {
  kind: FocusEntityKind;
  items: FocusListItem[];
  partnerId?: string;
  partnerName?: string;
}): FocusEntity | null {
  if (!opts.items.length) return null;
  const sole = opts.items.length === 1 ? opts.items[0] : undefined;
  return {
    kind: opts.kind,
    id: sole?.id,
    label: sole?.label ?? `${opts.items.length} items`,
    partnerId: opts.partnerId,
    partnerName: opts.partnerName,
    listItems: opts.items,
    updatedAt: Date.now(),
  };
}

export function inferFocusKindFromQueryAction(actionId: string): FocusEntityKind | undefined {
  if (actionId === "query.list_todos") return "todo";
  if (actionId === "query.list_opportunities") return "opportunity";
  if (actionId === "query.list_business_records") return "business_record";
  if (actionId === "query.get_partner") return "partner";
  return undefined;
}
