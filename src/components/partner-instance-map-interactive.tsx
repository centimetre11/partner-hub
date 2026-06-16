"use client";

import { useCallback, useState } from "react";
import type { Partner, User } from "@prisma/client";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import { MapNodeQuickEdit } from "@/components/map-node-quick-edit";
import type { FrameworkMapNode } from "@/lib/partner-framework";

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("ring-2", "ring-indigo-400", "ring-offset-2", "rounded-xl");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-indigo-400", "ring-offset-2", "rounded-xl");
  }, 1800);
}

export function PartnerInstanceMapInteractive({
  nodes,
  partner,
  users,
  pipelineStages,
  title,
  subtitle,
}: {
  nodes: FrameworkMapNode[];
  partner: Partner;
  users: User[];
  pipelineStages: { stage: number; name: string }[];
  title?: string;
  subtitle?: string;
}) {
  const [editNode, setEditNode] = useState<FrameworkMapNode | null>(null);

  const handleNodeClick = useCallback((node: FrameworkMapNode) => {
    if (node.scrollTo) scrollToSection(node.scrollTo);
    if (node.editable) setEditNode(node);
  }, []);

  return (
    <>
      <PartnerFrameworkMap
        nodes={nodes}
        title={title}
        subtitle={subtitle ?? "点击节点：跳转对应模块；可编辑项会弹出快捷编辑。"}
        compact
        interactive
        onNodeClick={handleNodeClick}
      />
      {editNode && (
        <MapNodeQuickEdit
          node={editNode}
          partner={partner}
          users={users}
          pipelineStages={pipelineStages}
          onClose={() => setEditNode(null)}
        />
      )}
    </>
  );
}
