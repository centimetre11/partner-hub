import { Badge } from "@/components/ui";
import {
  assignSceneModelAction,
  moveSceneModelAction,
  removeSceneModelAction,
} from "@/lib/ai-settings-actions";
import { LLM_SCENES, type LlmScene } from "@/lib/llm-scenes";
import { sceneRequirement } from "@/lib/model-capability-detect";

export type SceneModelRef = {
  apiConfigId: string;
  name: string;
  model: string;
  enabled: boolean;
  webSearch: boolean;
  vision: boolean;
};

export type SceneModelOption = {
  id: string;
  name: string;
  model: string;
  webSearch: boolean;
  vision: boolean;
};

type SceneMessages = {
  title: string;
  desc: string;
  assigned: string;
  available: string;
  add: string;
  remove: string;
  moveUp: string;
  moveDown: string;
  emptyScene: string;
  allAssigned: string;
  noModels: string;
  disabledTag: string;
  capWebSearch: string;
  capVision: string;
  capNoVision: string;
  warnNoWebSearch: string;
  warnNoVision: string;
  sceneNames: Record<LlmScene, string>;
  sceneHints: Record<LlmScene, string>;
};

const iconBtn =
  "rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:text-sky-600 disabled:opacity-30 disabled:hover:border-slate-200 disabled:hover:text-slate-600";

function CapBadge({
  webSearch,
  vision,
  scene,
  m,
}: {
  webSearch: boolean;
  vision: boolean;
  scene: LlmScene;
  m: SceneMessages;
}) {
  const req = sceneRequirement(scene);
  return (
    <>
      {webSearch && <Badge tone="green">{m.capWebSearch}</Badge>}
      {req === "vision" && (vision ? <Badge tone="blue">{m.capVision}</Badge> : <Badge tone="amber">{m.capNoVision}</Badge>)}
    </>
  );
}

function SceneCard({
  scene,
  assigned,
  options,
  m,
}: {
  scene: LlmScene;
  assigned: SceneModelRef[];
  options: SceneModelOption[];
  m: SceneMessages;
}) {
  const assignedIds = new Set(assigned.map((a) => a.apiConfigId));
  const available = options.filter((o) => !assignedIds.has(o.id));
  const req = sceneRequirement(scene);

  const warn =
    req === "web_search" && assigned.length > 0 && !assigned.some((a) => a.webSearch)
      ? m.warnNoWebSearch
      : req === "vision" && assigned.length > 0 && !assigned.some((a) => a.vision)
        ? m.warnNoVision
        : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{m.sceneNames[scene]}</span>
        <Badge tone={assigned.length ? "green" : "amber"}>
          {assigned.length ? String(assigned.length) : m.emptyScene}
        </Badge>
      </div>
      <p className="text-xs text-slate-400">{m.sceneHints[scene]}</p>

      {warn && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {warn}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.assigned}</div>
        {assigned.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
            {m.emptyScene}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {assigned.map((a, i) => (
              <li
                key={a.apiConfigId}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[11px] tabular-nums text-slate-400">{i + 1}.</span>
                  <span className="truncate text-xs text-slate-700">
                    {a.name} <span className="font-mono text-slate-400">· {a.model}</span>
                  </span>
                  <CapBadge webSearch={a.webSearch} vision={a.vision} scene={scene} m={m} />
                  {!a.enabled && <Badge tone="red">{m.disabledTag}</Badge>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <form action={moveSceneModelAction.bind(null, scene, a.apiConfigId, "up")}>
                    <button type="submit" className={iconBtn} disabled={i === 0} title={m.moveUp}>
                      ↑
                    </button>
                  </form>
                  <form action={moveSceneModelAction.bind(null, scene, a.apiConfigId, "down")}>
                    <button
                      type="submit"
                      className={iconBtn}
                      disabled={i === assigned.length - 1}
                      title={m.moveDown}
                    >
                      ↓
                    </button>
                  </form>
                  <form action={removeSceneModelAction.bind(null, scene, a.apiConfigId)}>
                    <button
                      type="submit"
                      className="rounded-md border border-red-100 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                      title={m.remove}
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.available}</div>
        {options.length === 0 ? (
          <div className="text-xs text-slate-400">{m.noModels}</div>
        ) : available.length === 0 ? (
          <div className="text-xs text-slate-400">{m.allAssigned}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((o) => (
              <form key={o.id} action={assignSceneModelAction.bind(null, scene, o.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:border-sky-300 hover:text-sky-600"
                  title={m.add}
                >
                  <span>+ {o.name}</span>
                  <span className="font-mono text-slate-400">· {o.model}</span>
                  {req === "web_search" && o.webSearch && <Badge tone="green">{m.capWebSearch}</Badge>}
                  {req === "vision" && o.vision && <Badge tone="blue">{m.capVision}</Badge>}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SceneModelsSetup({
  assignments,
  options,
  m,
}: {
  assignments: Record<string, SceneModelRef[]>;
  options: SceneModelOption[];
  m: SceneMessages;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed">{m.desc}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {LLM_SCENES.map((scene) => (
          <SceneCard
            key={scene}
            scene={scene}
            assigned={assignments[scene] ?? []}
            options={options}
            m={m}
          />
        ))}
      </div>
    </div>
  );
}
