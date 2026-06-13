import { db } from "./db";
import { SKILLS, skillsToTools, type Skill } from "./skills";
import type { ToolDef } from "./ai";

export type ResolvedAgentSkills = {
  skillNames: string[];
  promptFragments: string[];
  skillOptions: { name: string; label: string; desc: string; kind: string; id?: string }[];
};

/** 合并 Agent JSON skills 字段与 AgentSkill 关联，并收集 PROMPT 技能片段 */
export async function resolveAgentSkills(agentId?: string, skillsJson = "[]"): Promise<ResolvedAgentSkills> {
  const names = new Set<string>(JSON.parse(skillsJson || "[]") as string[]);
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

  const custom = await db.skill.findMany({
    where: { isBuiltin: false, kind: "PROMPT", OR: [{ shared: true }, { createdById: { not: null } }] },
    orderBy: { label: "asc" },
  });

  const skillOptions: ResolvedAgentSkills["skillOptions"] = SKILLS.map((s) => ({
    name: s.name,
    label: s.label,
    desc: s.desc,
    kind: "BUILTIN",
  }));
  for (const s of custom) {
    skillOptions.push({
      id: s.id,
      name: s.name,
      label: s.label,
      desc: s.description ?? "自定义提示词技能",
      kind: "PROMPT",
    });
  }

  return { skillNames: [...names], promptFragments, skillOptions };
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
