"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge, ScoreBar, TierBadge } from "@/components/ui";
import { setPipelineStageAction } from "@/lib/actions";
import { normalizePartnerTier, splitByTierFocus } from "@/lib/tier";
import { TierCFold } from "@/components/tier-c-fold";

export type KanbanPartnerCard = {
  id: string;
  name: string;
  pipelineStage: number;
  tier: string | null;
  staleDays: number;
  activityLabel: string;
  activityTone: "red" | "amber" | "slate";
  openTodoCount: number;
  nextTodoTitle: string | null;
  activeOppName: string | null;
  /** 七维伙伴健康分 0–100（非档案完整度） */
  healthScore: number;
};

export type KanbanStageMeta = {
  stage: number;
  name: string;
  desc: string;
};

type Copy = {
  emptyColumn: string;
  dragHint: string;
  stalled: string;
  openTodosCount: string;
  noOpenTodos: string;
  noActiveDeal: string;
  tierCFoldLabel: string;
  tierCFoldHint: string;
};

function stageColumnId(stage: number) {
  return `stage-${stage}`;
}

function parseStageFromOver(
  overId: string | undefined | null,
  cards: KanbanPartnerCard[],
): number | null {
  if (!overId) return null;
  if (overId.startsWith("stage-")) {
    const n = parseInt(overId.slice(6), 10);
    return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
  }
  return cards.find((c) => c.id === overId)?.pipelineStage ?? null;
}

function columnTone(stage: number, over: boolean) {
  if (stage === 1) {
    return over
      ? "border-sky-400 bg-sky-50/80 ring-2 ring-sky-200"
      : "border-sky-200/80 bg-sky-50/40";
  }
  if (stage === 2) {
    return over
      ? "border-amber-400 bg-amber-50/80 ring-2 ring-amber-200"
      : "border-amber-200/80 bg-amber-50/40";
  }
  return over
    ? "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200"
    : "border-emerald-200/80 bg-emerald-50/40";
}

function headerBadge(stage: number) {
  if (stage === 1) return "bg-sky-700 text-white";
  if (stage === 2) return "bg-amber-600 text-white";
  return "bg-emerald-700 text-white";
}

function truncate(text: string, max = 28) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A → B → C → unset */
function tierRank(tier: string | null): number {
  const t = normalizePartnerTier(tier);
  if (t === "A") return 0;
  if (t === "B") return 1;
  if (t === "C") return 2;
  return 3;
}

function sortCardsInColumn(list: KanbanPartnerCard[]) {
  return [...list].sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier);
    if (tr !== 0) return tr;
    return a.name.localeCompare(b.name, "zh");
  });
}

function CardBody({ card, copy }: { card: KanbanPartnerCard; copy: Copy }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm text-slate-900 min-w-0 break-words">{card.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <TierBadge tier={card.tier} />
          {card.staleDays > 30 && (
            <Badge tone="red">{copy.stalled.replace("{days}", String(card.staleDays))}</Badge>
          )}
        </div>
      </div>
      <div
        className={`text-[11px] mt-1.5 truncate ${
          card.activityTone === "red"
            ? "text-red-600"
            : card.activityTone === "amber"
              ? "text-amber-600"
              : "text-slate-500"
        }`}
      >
        {card.activityLabel}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 truncate">
        {card.openTodoCount > 0
          ? `${copy.openTodosCount.replace("{n}", String(card.openTodoCount))}${
              card.nextTodoTitle ? ` · ${truncate(card.nextTodoTitle, 20)}` : ""
            }`
          : copy.noOpenTodos}
        {" · "}
        {card.activeOppName ? truncate(card.activeOppName, 22) : copy.noActiveDeal}
      </div>
      <div className="mt-2 w-full max-w-[7rem]">
        <ScoreBar score={card.healthScore} />
      </div>
    </>
  );
}

function CardPreview({ card, copy, className = "" }: { card: KanbanPartnerCard; copy: Copy; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-300 bg-white shadow-lg p-3 ${className}`}>
      <CardBody card={card} copy={copy} />
    </div>
  );
}

function PartnerKanbanCard({ card, copy }: { card: KanbanPartnerCard; copy: Copy }) {
  const router = useRouter();
  const didDrag = useRef(false);
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { stage: card.pipelineStage, type: "partner" },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: card.id,
    data: { stage: card.pipelineStage, type: "partner" },
  });

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  useEffect(() => {
    if (isDragging) didDrag.current = true;
  }, [isDragging]);

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-slate-200/80 bg-white shadow-sm p-3 touch-none cursor-pointer hover:border-slate-300 ${
        isDragging ? "opacity-30 cursor-grabbing" : ""
      }`}
      {...listeners}
      {...attributes}
      role="link"
      tabIndex={0}
      onClick={() => {
        if (didDrag.current) {
          didDrag.current = false;
          return;
        }
        router.push(`/partners/${card.id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/partners/${card.id}`);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm text-slate-900 min-w-0 break-words">{card.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <TierBadge tier={card.tier} />
          {card.staleDays > 30 && (
            <Badge tone="red">{copy.stalled.replace("{days}", String(card.staleDays))}</Badge>
          )}
        </div>
      </div>
      <div
        className={`text-[11px] mt-1.5 truncate ${
          card.activityTone === "red"
            ? "text-red-600"
            : card.activityTone === "amber"
              ? "text-amber-600"
              : "text-slate-500"
        }`}
      >
        {card.activityLabel}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 truncate">
        {card.openTodoCount > 0
          ? `${copy.openTodosCount.replace("{n}", String(card.openTodoCount))}${
              card.nextTodoTitle ? ` · ${truncate(card.nextTodoTitle, 20)}` : ""
            }`
          : copy.noOpenTodos}
        {" · "}
        {card.activeOppName ? truncate(card.activeOppName, 22) : copy.noActiveDeal}
      </div>
      <div className="mt-2 w-full max-w-[7rem]">
        <ScoreBar score={card.healthScore} />
      </div>
    </div>
  );
}

function KanbanColumn({
  stage,
  name,
  desc,
  cards,
  copy,
  highlight,
  forceOpenTierC,
}: {
  stage: number;
  name: string;
  desc: string;
  cards: KanbanPartnerCard[];
  copy: Copy;
  highlight: boolean;
  forceOpenTierC: boolean;
}) {
  const id = stageColumnId(stage);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { stage, type: "column" },
  });

  const { primary, folded } = splitByTierFocus(cards, (c) => normalizePartnerTier(c.tier));

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[260px] w-[min(100%,320px)] sm:min-w-[280px] lg:min-w-0 lg:flex-1 rounded-xl border ${columnTone(
        stage,
        highlight || isOver,
      )} max-h-[calc(100vh-14rem)]`}
    >
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${headerBadge(stage)}`}
          >
            {stage}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 truncate">
              {name}
              <span className="ml-1.5 text-xs font-normal text-slate-500 tabular-nums">{cards.length}</span>
            </div>
            <div className="text-[11px] text-slate-500 truncate" title={desc}>
              {desc}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2 min-h-[4rem]">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
            {copy.emptyColumn}
          </div>
        ) : (
          <>
            {primary.map((card) => (
              <PartnerKanbanCard key={card.id} card={card} copy={copy} />
            ))}
            <TierCFold
              count={folded.length}
              storageKey="partner-kanban-show-c"
              forceOpen={forceOpenTierC}
              label={copy.tierCFoldLabel.replace("{n}", String(folded.length))}
              hint={copy.tierCFoldHint}
            >
              {folded.map((card) => (
                <PartnerKanbanCard key={card.id} card={card} copy={copy} />
              ))}
            </TierCFold>
          </>
        )}
      </div>
    </div>
  );
}

export function PartnerKanbanBoard({
  initialCards,
  stages,
  copy,
  filterStage,
  filterTier,
}: {
  initialCards: KanbanPartnerCard[];
  stages: KanbanStageMeta[];
  copy: Copy;
  /** When set (legacy ?stage=), show only that column */
  filterStage?: number | null;
  /** URL ?tier= — C 时强制展开折叠区 */
  filterTier?: string | null;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);
  const forceOpenTierC = String(filterTier ?? "").trim().toUpperCase() === "C";

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const visibleStages = useMemo(() => {
    const list =
      filterStage && filterStage >= 1 && filterStage <= 3
        ? stages.filter((s) => s.stage === filterStage)
        : [...stages];
    // 3 → 2 → 1
    return list.sort((a, b) => b.stage - a.stage);
  }, [stages, filterStage]);

  const byStage = useMemo(() => {
    const map = new Map<number, KanbanPartnerCard[]>();
    for (const s of visibleStages) map.set(s.stage, []);
    for (const c of cards) {
      const list = map.get(c.pipelineStage);
      if (list) list.push(c);
    }
    for (const [stage, list] of map) {
      map.set(stage, sortCardsInColumn(list));
    }
    return map;
  }, [cards, visibleStages]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActiveId(null);
      setOverStage(null);
      const partnerId = String(e.active.id);
      const fromStage = Number(e.active.data.current?.stage);
      const toStage = parseStageFromOver(e.over?.id ? String(e.over.id) : null, cards);
      if (toStage == null || toStage === fromStage || !Number.isInteger(fromStage)) return;

      const prev = cards;
      setCards((list) =>
        list.map((c) => (c.id === partnerId ? { ...c, pipelineStage: toStage } : c)),
      );
      try {
        await setPipelineStageAction(partnerId, toStage);
        // Keep optimistic board state; skip full RSC refresh for snappier drag UX
      } catch {
        setCards(prev);
        router.refresh();
      }
    },
    [cards, router],
  );

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-2">{copy.dragHint}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={(e) => {
          setOverStage(parseStageFromOver(e.over?.id ? String(e.over.id) : null, cards));
        }}
        onDragCancel={() => {
          setActiveId(null);
          setOverStage(null);
        }}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2 items-stretch">
          {visibleStages.map((s) => (
            <KanbanColumn
              key={s.stage}
              stage={s.stage}
              name={s.name}
              desc={s.desc}
              cards={byStage.get(s.stage) ?? []}
              copy={copy}
              highlight={overStage === s.stage}
              forceOpenTierC={forceOpenTierC}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="w-[280px]">
              <CardPreview card={activeCard} copy={copy} className="rotate-1" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
