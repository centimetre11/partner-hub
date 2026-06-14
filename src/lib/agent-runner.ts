import type { Agent } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, type ChatMessage, type ToolDef } from "./ai";
import {
  KIMI_BUILTIN_SEARCH,
  newSkillContext,
  REPORT_AGENT_KEYWORDS,
  runSkill,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
} from "./skills";
import { partnerContext } from "./proposals";
import { buildToolsForAgent, resolveAgentSkills } from "./skill-resolver";

const MAX_STEPS = 12;

// ============ 调度时间计算 ============

export function computeNextRunAt(agent: Pick<Agent, "frequency" | "runHour" | "runWeekday">, from = new Date()): Date {
  const next = new Date(from);
  if (agent.frequency === "HOURLY") {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }
  if (agent.frequency === "WEEKLY") {
    next.setHours(agent.runHour, 0, 0, 0);
    // JS: 0=周日…6=周六；存储：1=周一…7=周日
    const targetDow = agent.runWeekday % 7;
    let delta = (targetDow - next.getDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setDate(next.getDate() + delta);
    return next;
  }
  // DAILY 默认
  next.setHours(agent.runHour, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

// ============ Webhook 推送（兼容飞书/企微/Slack 的 text 格式） ============

async function pushWebhook(url: string, title: string, content: string) {
  const text = `【${title}】\n${content.slice(0, 3500)}`;
  const bodies = [
    { msg_type: "text", content: { text } }, // 飞书
    { msgtype: "text", text: { content: text } }, // 企业微信/钉钉
    { text }, // Slack
  ];
  for (const body of bodies) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        // 飞书/企微返回 code/errcode 非 0 表示格式不对，尝试下一种
        if (data && (data.code === 0 || data.errcode === 0 || (data.code === undefined && data.errcode === undefined))) {
          return;
        }
      }
    } catch {
      // 尝试下一种格式
    }
  }
}

// ============ Agent 执行 ============

export async function runAgent(agentId: string, triggeredBy: "manual" | "schedule" = "manual"): Promise<string> {
  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId }, include: { partner: true, createdBy: true } });

  const run = await db.agentRun.create({ data: { agentId: agent.id, status: "RUNNING" } });
  const toolLog: { tool: string; args: unknown; result: string }[] = [];
  let documentSaved = false;

  try {
    const resolved = await resolveAgentSkills(agent.id, agent.skills);
    const skillNames = resolved.skillNames;
    const volcSearch = skillNames.includes("web_search") && (await shouldUseVolcengineBuiltinSearch());
    const effectiveSkillNames = volcSearch ? skillNames.filter((n) => n !== "web_search") : skillNames;
    const tools: (ToolDef | Record<string, unknown>)[] = buildToolsForAgent(effectiveSkillNames);
    const kimiSearch = skillNames.includes("web_search") && !volcSearch && (await shouldUseKimiBuiltinSearch());
    if (kimiSearch) tools.push(KIMI_BUILTIN_SEARCH);

    // 作用域上下文
    let scopeCtx = "";
    if (agent.scopeType === "PARTNER" && agent.partnerId) {
      scopeCtx = `\n\n【你绑定的伙伴档案】\n${await partnerContext(agent.partnerId)}`;
    }

    const system = `你是帆软软件（Fanruan，中国领先BI厂商，产品 FineReport/FineBI/FineDataLink）中东区伙伴管理系统中的自动化 Agent，名叫「${agent.name}」。
今天是 ${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}。
本次运行方式：${triggeredBy === "schedule" ? "定时自动触发" : "用户手动触发"}。

【你的任务指令】
${agent.instructions}
${scopeCtx}
${resolved.promptFragments.length ? `\n【附加技能提示】\n${resolved.promptFragments.join("\n\n")}` : ""}

【工作规则】
1. 用工具获取真实信息，不要编造。监测伙伴动态时优先 linkedin_search（公司+高管），再用 web_search 补充新闻。
2. 需要帆软/中东策略背景时，先用 search_knowledge 检索团队知识库，再用 read_kms 查 KMS 内部文档（如已配置令牌）。
3. 发现与某个伙伴相关的有价值动态时，用 add_timeline_event 记入该伙伴时间线（如有该工具）。
4. 需要修改伙伴档案字段时调用 update_partner，系统会自动转为提案等人工确认。
5. 会前简报、联合方案等报告类任务完成后，用 create_document 写入报告中心（如已启用该技能）。
6. 完成任务后，输出最终简报（Markdown，中文）：开头一句话结论，然后分点列出发现/建议/已执行的动作。如果没有值得汇报的新发现，明确说"本次无新发现"并简述检查了什么。
7. 简报就是你的最后一条消息，不需要调用工具来发送。`;

    const chat: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: "开始执行任务。" },
    ];

    const ctx = newSkillContext({
      mode: "agent",
      userId: agent.createdById,
      agentId: agent.id,
      agentName: agent.name,
    });

    let output = "";
    for (let i = 0; i < MAX_STEPS; i++) {
      const { content, toolCalls } = await chatCompletion(chat, {
        tools,
        temperature: 0.3,
        feature: `Agent 运行：${agent.name}`,
        userId: agent.createdById ?? undefined,
      });
      if (!toolCalls.length) {
        output = content ?? "（无输出）";
        break;
      }
      chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let result: string;
        if (tc.function.name === "$web_search") {
          // Kimi 内置搜索：原样回传参数，搜索由平台侧执行
          result = tc.function.arguments;
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {}
          result = await runSkill(tc.function.name, args, ctx);
          toolLog.push({ tool: tc.function.name, args, result: result.slice(0, 500) });
          if (tc.function.name === "create_document") documentSaved = true;
        }
        chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
      if (i === MAX_STEPS - 1) {
        output = "（执行步骤达到上限，任务可能未完成。已执行的动作见日志。）";
      }
    }

    if (ctx.actions.length) {
      output += `\n\n---\n已执行的动作：\n${ctx.actions.map((a) => `- ${a}`).join("\n")}`;
    }

    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", output, toolLog: JSON.stringify(toolLog), finishedAt: new Date() },
    });

    // 报告类 Agent 自动落库（若 Agent 未主动调用 create_document）
    const isReportAgent = REPORT_AGENT_KEYWORDS.some((k) => agent.name.includes(k));
    if (isReportAgent && output && !documentSaved) {
      const docType = agent.name.includes("联合") ? "JOINT_SOLUTION" : "MEETING_PREP";
      await db.document.create({
        data: {
          title: `${agent.icon} ${agent.name} · ${new Date().toLocaleDateString("zh-CN")}`,
          type: docType,
          content: output,
          status: "DRAFT",
          partnerId: agent.partnerId,
          agentRunId: run.id,
          createdById: agent.createdById,
        },
      });
    }

    // 收件箱通知
    await db.notification.create({
      data: {
        title: `${agent.icon} ${agent.name} 运行完成`,
        content: output,
        agentRunId: run.id,
        partnerId: agent.partnerId,
      },
    });
    // 待确认提案单独成条
    for (const p of ctx.pendingProposals) {
      await db.notification.create({
        data: {
          title: `${agent.icon} ${agent.name} 提议修改「${p.partnerName}」档案`,
          content: p.fieldUpdates.map((f) => `${f.label}：${f.oldValue ?? "（空）"} → ${f.newValue}`).join("\n"),
          agentRunId: run.id,
          partnerId: p.partnerId,
          proposal: JSON.stringify(p),
        },
      });
    }

    // Webhook 推送
    if (agent.webhookUrl) {
      await pushWebhook(agent.webhookUrl, `${agent.name}`, output);
    }

    await db.agent.update({ where: { id: agent.id }, data: { lastRunAt: new Date() } });
    return output;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: msg, toolLog: JSON.stringify(toolLog), finishedAt: new Date() },
    });
    await db.notification.create({
      data: { title: `${agent.icon} ${agent.name} 运行失败`, content: msg, agentRunId: run.id },
    });
    throw e;
  }
}

// ============ 调度器（每分钟由 instrumentation 调用） ============

let ticking = false;

export async function schedulerTick() {
  if (ticking) return;
  ticking = true;
  try {
    const due = await db.agent.findMany({
      where: {
        enabled: true,
        isTemplate: false,
        trigger: "SCHEDULE",
        nextRunAt: { lte: new Date() },
      },
    });
    for (const agent of due) {
      // 先推进 nextRunAt，避免运行慢导致重复触发
      await db.agent.update({
        where: { id: agent.id },
        data: { nextRunAt: computeNextRunAt(agent) },
      });
      try {
        await runAgent(agent.id, "schedule");
      } catch (e) {
        console.error(`[agent-scheduler] ${agent.name} 运行失败:`, e);
      }
    }
  } catch (e) {
    console.error("[agent-scheduler] tick 出错:", e);
  } finally {
    ticking = false;
  }
}
