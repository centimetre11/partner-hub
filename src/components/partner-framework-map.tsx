"use client";

import type { FrameworkMapNode } from "@/lib/partner-framework";
import { groupMapByLayer } from "@/lib/partner-framework";

const STATUS_STYLES: Record<string, { box: string; dot: string; label: string }> = {
  info: {
    box: "border-zinc-200 bg-zinc-50/80 text-zinc-700",
    dot: "bg-zinc-400",
    label: "Reference",
  },
  current: {
    box: "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-200",
    dot: "bg-white",
    label: "Current",
  },
  done: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-500",
    label: "Ready",
  },
  partial: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-500",
    label: "Partial",
  },
  missing: {
    box: "border-zinc-200 bg-white text-zinc-500",
    dot: "bg-zinc-300",
    label: "To fill",
  },
};

function MapNode({
  node,
  compact,
  interactive,
  onNodeClick,
}: {
  node: FrameworkMapNode;
  compact?: boolean;
  interactive?: boolean;
  onNodeClick?: (node: FrameworkMapNode) => void;
}) {
  const s = STATUS_STYLES[node.status] ?? STATUS_STYLES.info;
  const clickable = interactive && onNodeClick;

  const inner = (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-all ${s.box} ${compact ? "min-h-[72px]" : "min-h-[88px]"} ${
        clickable ? "cursor-pointer hover:brightness-[0.98] hover:shadow-sm active:scale-[0.99]" : ""
      } ${node.editable && interactive ? "ring-1 ring-indigo-200/60" : ""}`}
      title={node.hint}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium truncate ${compact ? "text-xs" : "text-sm"}`}>{node.label}</div>
          {node.hint && !compact && <div className="text-[10px] opacity-70 mt-0.5 line-clamp-2">{node.hint}</div>}
        </div>
        {node.status !== "info" && (
          <span className={`shrink-0 w-2 h-2 rounded-full mt-1 ${s.dot}`} />
        )}
      </div>
      {node.value && (
        <div className={`mt-1.5 truncate ${compact ? "text-[10px]" : "text-xs"} ${node.status === "current" ? "text-indigo-100" : "opacity-80"}`}>
          {node.value}
        </div>
      )}
      {node.editable && interactive && (
        <div className={`mt-1 text-[10px] ${node.status === "current" ? "text-indigo-200" : "text-indigo-500"}`}>
          Editable
        </div>
      )}
    </div>
  );

  if (clickable && onNodeClick) {
    return (
      <button type="button" className="block w-full text-left" onClick={() => onNodeClick(node)}>
        {inner}
      </button>
    );
  }
  return inner;
}

function LayerArrow() {
  return (
    <div className="flex justify-center py-1" aria-hidden>
      <div className="flex flex-col items-center text-zinc-300">
        <div className="w-px h-3 bg-zinc-200" />
        <span className="text-[10px]">▼</span>
      </div>
    </div>
  );
}

export function PartnerFrameworkMap({
  nodes,
  title,
  subtitle,
  compact = false,
  legend = true,
  interactive = false,
  onNodeClick,
}: {
  nodes: FrameworkMapNode[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
  legend?: boolean;
  interactive?: boolean;
  onNodeClick?: (node: FrameworkMapNode) => void;
}) {
  const grouped = groupMapByLayer(nodes);

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 overflow-hidden">
      {(title || subtitle) && (
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100">
          {title && <h2 className="text-base font-semibold text-zinc-900">{title}</h2>}
          {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
        </div>
      )}

      <div className={`px-5 ${title || subtitle ? "pt-4" : "pt-5"} pb-5 space-y-0`}>
        {grouped.map(({ layer, nodes: layerNodes }, idx) => (
          <div key={layer}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {layer}
              </span>
              {layer === "Positioning" && <span className="text-xs text-zinc-400">Who · Where · What type</span>}
              {layer === "Playbook" && <span className="text-xs text-zinc-400">What we sell · How we pitch</span>}
              {layer === "Actions" && <span className="text-xs text-zinc-400">Four-domain required actions</span>}
              {layer === "Execution" && (
                <span className="text-xs text-zinc-400">{interactive ? "System modules · click to navigate" : "System modules"}</span>
              )}
              {layer === "Stage exit" && <span className="text-xs text-zinc-400">Stage exit checklist</span>}
            </div>
            <div
              className={`grid gap-2 ${
                layerNodes.length >= 6
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                  : layerNodes.length === 4
                    ? "grid-cols-2 lg:grid-cols-4"
                    : layerNodes.length === 3
                      ? "grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-2"
              }`}
            >
              {layerNodes.map((n) => (
                <MapNode
                  key={n.id}
                  node={n}
                  compact={compact}
                  interactive={interactive}
                  onNodeClick={onNodeClick}
                />
              ))}
            </div>
            {idx < grouped.length - 1 && <LayerArrow />}
          </div>
        ))}
      </div>

      {legend && (
        <div className="px-5 py-3 border-t border-zinc-100 flex flex-wrap gap-3 text-[10px] text-zinc-500">
          {Object.entries(STATUS_STYLES)
            .filter(([k]) => k !== "info" || !nodes.some((n) => n.status !== "info"))
            .map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                {v.label}
              </span>
            ))}
          {interactive && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full ring-1 ring-indigo-300 bg-indigo-50" />
              Editable
            </span>
          )}
        </div>
      )}
    </div>
  );
}
