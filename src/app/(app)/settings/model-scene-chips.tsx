"use client";

import { assignSceneModelAction, removeSceneModelAction } from "@/lib/ai-settings-actions";
import { LLM_SCENES, type LlmScene } from "@/lib/llm-scenes";
import { useMessages } from "@/lib/i18n/context";

/**
 * 模型卡片上的「场景开关」：从模型这一侧直接把它加入/移出各个场景。
 * 同一个模型可以同时属于多个场景；与「场景模型分配」面板共用同一份数据。
 */
export function ModelSceneChips({
  modelId,
  assignedScenes,
}: {
  modelId: string;
  assignedScenes: string[];
}) {
  const sc = useMessages().settings.scenes;
  const set = new Set(assignedScenes);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {sc.modelScenesLabel}
      </span>
      {LLM_SCENES.map((scene: LlmScene) => {
        const on = set.has(scene);
        const action = on
          ? removeSceneModelAction.bind(null, scene, modelId)
          : assignSceneModelAction.bind(null, scene, modelId);
        return (
          <form key={scene} action={action}>
            <button
              type="submit"
              title={on ? sc.remove : sc.add}
              className={
                on
                  ? "rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                  : "rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-500 hover:border-sky-300 hover:text-sky-600"
              }
            >
              {on ? "✓ " : "+ "}
              {sc.sceneNames[scene]}
            </button>
          </form>
        );
      })}
    </div>
  );
}
