import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { AIError, chatCompletion, type ChatMessage, type ToolDef } from "@/lib/ai";
import { PARTNER_FIELD_LABELS, stageName } from "@/lib/constants";
import { partnerContext } from "@/lib/proposals";
import { computeCompleteness, staleDays } from "@/lib/completeness";

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_partners",
      description: "搜索/筛选伙伴列表。返回伙伴的基本信息、Pipeline阶段、完整度、停滞天数。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "公司名关键词（可选）" },
          status: { type: "string", enum: ["PROSPECT", "ACTIVE", "ARCHIVED"], description: "PROSPECT候选/ACTIVE正式" },
          tier: { type: "string", enum: ["A", "B", "C"] },
          country: { type: "string", description: "国家关键词，如 KSA、UAE" },
          staleDaysOver: { type: "number", description: "只返回超过N天无动态的伙伴" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_partner",
      description: "按名称获取某个伙伴的完整档案（画像、权力地图、商机）。",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "公司名（支持模糊匹配）" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_partner",
      description: `更新伙伴档案字段。可用字段：${Object.entries(PARTNER_FIELD_LABELS).map(([f, l]) => `${f}(${l})`).join("、")}。pipelineStage 为 1-10 的数字。`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "公司名" },
          fields: { type: "object", description: "要更新的字段键值对，如 {\"pipelineStage\": 5, \"priority\": \"P0\"}" },
        },
        required: ["name", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_todo",
      description: "创建待办事项。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          partnerName: { type: "string", description: "关联的伙伴公司名（可选）" },
          dueDate: { type: "string", description: "截止日期 YYYY-MM-DD（可选）" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          detail: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_todos",
      description: "查看待办事项列表。",
      parameters: {
        type: "object",
        properties: {
          overdueOnly: { type: "boolean", description: "只看逾期的" },
          partnerName: { type: "string", description: "按伙伴筛选" },
        },
      },
    },
  },
];

async function findPartnerByName(name: string) {
  return (
    (await db.partner.findFirst({ where: { name: { equals: name } } })) ??
    (await db.partner.findFirst({ where: { name: { contains: name } } }))
  );
}

async function runTool(name: string, args: Record<string, unknown>, userId: string): Promise<string> {
  switch (name) {
    case "search_partners": {
      const partners = await db.partner.findMany({
        where: {
          ...(args.query ? { name: { contains: String(args.query) } } : {}),
          ...(args.status ? { status: String(args.status) } : {}),
          ...(args.tier ? { tier: String(args.tier) } : {}),
          ...(args.country ? { country: { contains: String(args.country) } } : {}),
        },
        include: { contacts: true, opportunities: true, events: true, trainings: true, owner: true },
        take: 100,
      });
      const rows = partners
        .map((p) => {
          const stale = staleDays(p);
          if (args.staleDaysOver && stale <= Number(args.staleDaysOver)) return null;
          const c = computeCompleteness(p);
          return `${p.name} | ${p.status === "ACTIVE" ? "正式" : p.status === "PROSPECT" ? "候选" : "归档"} | Tier ${p.tier ?? "-"} | ${p.country ?? "?"} | 阶段${p.pipelineStage}(${stageName(p.pipelineStage)}) | 完整度${c.score}% | ${stale}天无动态 | 负责人:${p.owner?.name ?? "无"} | 客户:${(p.knownClients ?? "").slice(0, 50)}`;
        })
        .filter(Boolean);
      return rows.length ? rows.join("\n") : "没有符合条件的伙伴";
    }
    case "get_partner": {
      const p = await findPartnerByName(String(args.name));
      if (!p) return `找不到名为「${args.name}」的伙伴`;
      return await partnerContext(p.id);
    }
    case "update_partner": {
      const p = await findPartnerByName(String(args.name));
      if (!p) return `找不到名为「${args.name}」的伙伴`;
      const fields = (args.fields ?? {}) as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      const changes: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (!(k in PARTNER_FIELD_LABELS) || k === "name") continue;
        if (k === "pipelineStage" || k === "fitScore") {
          const n = parseInt(String(v), 10);
          if (!Number.isNaN(n)) {
            data[k] = n;
            changes.push(`${PARTNER_FIELD_LABELS[k]} → ${k === "pipelineStage" ? `${n}(${stageName(n)})` : n}`);
          }
        } else {
          data[k] = String(v);
          changes.push(`${PARTNER_FIELD_LABELS[k]} → ${v}`);
        }
      }
      if (!changes.length) return "没有可更新的有效字段";
      await db.partner.update({ where: { id: p.id }, data });
      await db.timelineEvent.create({
        data: {
          partnerId: p.id,
          type: "CHANGE",
          title: "AI 助手更新档案",
          content: changes.join("；"),
          createdById: userId,
          meta: JSON.stringify({ via: "assistant", fields }),
        },
      });
      revalidatePath(`/partners/${p.id}`);
      revalidatePath("/partners");
      return `已更新 ${p.name}：${changes.join("；")}`;
    }
    case "create_todo": {
      let partnerId: string | null = null;
      if (args.partnerName) {
        const p = await findPartnerByName(String(args.partnerName));
        partnerId = p?.id ?? null;
      }
      const t = await db.todoItem.create({
        data: {
          title: String(args.title),
          detail: args.detail ? String(args.detail) : null,
          partnerId,
          assigneeId: userId,
          dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
          priority: ["HIGH", "MEDIUM", "LOW"].includes(String(args.priority)) ? String(args.priority) : "MEDIUM",
          source: "AI",
        },
      });
      revalidatePath("/todos");
      revalidatePath("/");
      return `已创建待办：${t.title}${t.dueDate ? `（截止 ${t.dueDate.toISOString().slice(0, 10)}）` : ""}`;
    }
    case "list_todos": {
      const todos = await db.todoItem.findMany({
        where: {
          status: "OPEN",
          ...(args.overdueOnly ? { dueDate: { lt: new Date() } } : {}),
          ...(args.partnerName
            ? { partner: { name: { contains: String(args.partnerName) } } }
            : {}),
        },
        include: { partner: true, assignee: true },
        orderBy: { dueDate: "asc" },
        take: 50,
      });
      return todos.length
        ? todos
            .map(
              (t) =>
                `[${t.priority}] ${t.title} | 伙伴:${t.partner?.name ?? "-"} | 截止:${t.dueDate?.toISOString().slice(0, 10) ?? "-"} | 负责:${t.assignee?.name ?? "-"}`
            )
            .join("\n")
        : "没有未完成的待办";
    }
    default:
      return `未知工具：${name}`;
  }
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { messages } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[] };

  const system = `你是「帆软中东伙伴管理系统」的 AI 助手，帮助帆软软件（Fanruan，中国领先BI厂商）中东区 BD 团队管理合作伙伴。
今天是 ${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}。
你可以用工具查询和修改系统数据。规则：
1. 回答用中文，简洁、面向行动。
2. 查询类问题：先用工具拿到真实数据再回答，不要凭空编造。
3. 修改类指令（推进阶段、改字段、建待办）：直接执行并明确告知做了什么修改。修改前如果指令含糊，先查询确认对象再执行。
4. 跨伙伴对比分析：调工具获取双方档案后给出有理有据的建议。
5. 背景：帆软产品 FineReport（中国式复杂报表）/ FineBI（自助分析）/ FineDataLink（数据集成）；中东主打差异化是复杂报表能力+数据主权合规（纯内网部署）；策略材料包括 Tier A/B/C 作战清单、前三单补贴（首单+20%折扣+免费驻场2周）、首年超级折扣（L2 40%/L3 50%/L4 60%）、Fast Track（Tableau/微软转投伙伴≥5人认证直接L2）。`;

  const chat: ChatMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  const actions: string[] = [];
  try {
    for (let i = 0; i < 8; i++) {
      const { content, toolCalls } = await chatCompletion(chat, { tools: TOOLS, temperature: 0.3 });
      if (!toolCalls.length) {
        return NextResponse.json({ reply: content ?? "（无回复）", actions });
      }
      chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {}
        const result = await runTool(tc.function.name, args, uid);
        if (["update_partner", "create_todo"].includes(tc.function.name)) actions.push(result);
        chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    }
    return NextResponse.json({ reply: "（处理步骤过多，已中止。请把问题拆小一点再试。）", actions });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `助手出错：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
