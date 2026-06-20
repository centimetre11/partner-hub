"use client";

import { useMemo } from "react";
import type { FrameworkMapNode } from "@/lib/partner-framework";
import { groupMapByLayer } from "@/lib/partner-framework";
import { useLabels, useMessages } from "@/lib/i18n/context";

function MapNode({
  node,
  compact,
  interactive,
  onNodeClick,
  statusStyles,
  editableLabel,
}: {
  node: FrameworkMapNode;
  compact?: boolean;
  interactive?: boolean;
  onNodeClick?: (node: FrameworkMapNode) => void;
  statusStyles: Record<string, { box: string; dot: string; label: string }>;
  editableLabel: string;
}) {
  const s = statusStyles[node.status] ?? statusStyles.info;
  const clickable = interactive && onNodeClick;

  const inner = (
    <div
      className={`rounded-lg border px-3 py-2.5 ${s.box} ${compact ? "min-h-[72px]" : "min-h-[88px]"} ${
        clickable ? "cursor-pointer hover:bg-slate-50" : ""
      } ${node.editable && interactive ? "ring-1 ring-slate-200/60" : ""}`}
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
        <div className={`mt-1.5 truncate ${compact ? "text-[10px]" : "text-xs"} ${node.status === "current" ? "text-slate-400" : "opacity-80"}`}>
          {node.value}
        </div>
      )}
      {node.editable && interactive && (
        <div className={`mt-1 text-[10px] ${node.status === "current" ? "text-slate-400" : "text-slate-500"}`}>
          {editableLabel}
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
      <div className="flex flex-col items-center text-slate-300">
        <div className="w-px h-3 bg-slate-200" />
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
  const labels = useLabels();
  const m = useMessages();
  const fm = m.frameworkMap;

  const statusStyles = useMemo(
    () => ({
      info: { box: "border-slate-200 bg-slate-50/80 text-slate-700", dot: "bg-slate-400", label: fm.reference },
      current: { box: "border-slate-700 bg-slate-900 text-white border border-slate-300", dot: "bg-white", label: fm.current },
      done: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500", label: fm.ready },
      partial: { box: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500", label: fm.partial },
      missing: { box: "border-slate-200 bg-white text-slate-500", dot: "bg-slate-300", label: fm.toFill },
    }),
    [fm],
  );

  const grouped = groupMapByLayer(nodes);

  const layerHint = (layer: string) => {
    const idx = labels.frameworkLayerOrder.indexOf(layer);
    if (idx < 0) return "";
    if (idx === 3 && interactive) return fm.layerExecutionInteractive;
    return fm.layerHints[idx] ?? "";
  };

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white overflow-hidden">
      {(title || subtitle) && (
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      )}

      <div className={`px-5 ${title || subtitle ? "pt-4" : "pt-5"} pb-5 space-y-0`}>
        {grouped.map(({ layer, nodes: layerNodes }, idx) => (
          <div key={layer}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 bg-slate-50 px-2 py-0.5 rounded-full">
                {layer}
              </span>
              {layerHint(layer) && <span className="text-xs text-slate-400">{layerHint(layer)}</span>}
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
                  statusStyles={statusStyles}
                  editableLabel={fm.editable}
                />
              ))}
            </div>
            {idx < grouped.length - 1 && <LayerArrow />}
          </div>
        ))}
      </div>

      {legend && (
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-3 text-[10px] text-slate-500">
          {Object.entries(statusStyles)
            .filter(([k]) => k !== "info" || !nodes.some((n) => n.status !== "info"))
            .map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                {v.label}
              </span>
            ))}
          {interactive && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full ring-1 ring-slate-300 bg-slate-50" />
              {fm.editable}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
