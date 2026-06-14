import { db } from "./db";
import { SKILLS, skillsToTools, type Skill } from "./skills";
import type { ToolDef } from "./ai";

export type ToolOption = { name: string; label: string; desc: string };
export type PromptSkillOption = { id: string; name: string; label: string; desc: string };

export type ResolvedAgentSkills = {
  skillNames: string[];
  promptFragments: string[];
  toolOptions: ToolOption[];
  promptSkillOptions: PromptSkillOption[];
  /** @deprecated 兼容旧调用，等于 [...toolOptions as kind=BUILTIN, ...promptSkillOptions as kind=PROMPT] */
  skillOptions: { name: string; label: string; desc: string; kind: string; id?: string }[];
};

/** 合并 Agent JSON skills 字段与 AgentSkill 关联，并收集 PROMPT 技能片段 */
export async function resolveAgentSkills(agentId?: string, skillsJson = "[]"): Promise<ResolvedAgentSkills> {
  const validToolNames = new Set(SKILLS.map((s) => s.name));
  const names = new Set<string>((JSON.parse(skillsJson || "[]") as string[]).filter((n) => validToolNames.has(n)));
  const promptFragments: string[] = [];

  if (agentId) {
    const links = await db.agentSkill.findMany({ where: { agentId }, include: { skill: true } });
    for (const { skill } of links) {
      if (skill.kind === "PROMPT" && skill.promptBody) {
        promptFragments.push(`【技能：${skill.label}】\n${skill.promptBody}`);
      } else if (skill.isBuiltin || skill.kind === "BUILTIN") {
        names.add(skill.name);
      }
    }
  }

  for (const n of [...names]) {
    if (!validToolNames.has(n)) names.delete(n);
  }

  const custom = await db.skill.findMany({
    where: { isBuiltin: false, kind: "PROMPT", OR: [{ shared: true }, { createdById: { not: null } }] },
    orderBy: { label: "asc" },
  });

  const toolOptions: ToolOption[] = SKILLS.map((s) => ({
    name: s.name,
    label: s.label,
    desc: s.desc,
  }));
  const promptSkillOptions: PromptSkillOption[] = custom.map((s) => ({
    id: s.id,
    name: s.name,
    label: s.label,
    desc: s.description ?? "自定义方法论技能",
  }));
  const skillOptions: ResolvedAgentSkills["skillOptions"] = [
    ...toolOptions.map((t) => ({ ...t, kind: "BUILTIN" })),
    ...promptSkillOptions.map((s) => ({ ...s, kind: "PROMPT" })),
  ];

  return { skillNames: [...names], promptFragments, toolOptions, promptSkillOptions, skillOptions };
}

export function buildToolsForAgent(skillNames: string[]): (ToolDef | Record<string, unknown>)[] {
  return skillsToTools(skillNames);
}

export async function seedBuiltinSkillsIfNeeded() {
  for (const s of SKILLS) {
    const exists = await db.skill.findFirst({ where: { name: s.name, isBuiltin: true } });
    if (exists) continue;
    await db.skill.create({
      data: {
        name: s.name,
        label: s.label,
        description: s.desc,
        kind: "BUILTIN",
        toolDef: JSON.stringify(s.def),
        isBuiltin: true,
        shared: true,
      },
    });
  }
}
