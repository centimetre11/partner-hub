import type { Agent } from "@prisma/client";
import { db } from "./db";
import type { ChatMessage, ToolDef } from "./ai";
import { runToolLoop } from "./ai-tool-loop";
import type { TraceEmitter } from "./ai-trace";
import { computeNextRunFromCron } from "./cron";
import {
  newSkillContext,
  REPORT_AGENT_KEYWORDS,
  runSkill,
} from "./skills";
import { partnerContext } from "./proposals";
import { buildToolsForAgent, resolveAgentSkills } from "./skill-resolver";

const MAX_STEPS = 12;

function agentMaxSteps(agent: Pick<Agent, "maxIterations" | "isAutomation">): number {
  if (agent.isAutomation && agent.maxIterations > 0) return agent.maxIterations;
  return MAX_STEPS;
}

// ============ Schedule time calculation ============

export function computeNextRunAt(
  agent: Pick<Agent, "frequency" | "runHour" | "runWeekday" | "cronExpr">,
  from = new Date()
): Date {
  if (agent.cronExpr) {
    const fromCron = computeNextRunFromCron(agent.cronExpr, from);
    if (fromCron) return fromCron;
  }
  const next = new Date(from);
  if (agent.frequency === "HOURLY") {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }
  if (agent.frequency === "WEEKLY") {
    next.setHours(agent.runHour, 0, 0, 0);
    // JS: 0=Sun…6=Sat; stored: 1=Mon…7=Sun
    const targetDow = agent.runWeekday % 7;
    let delta = (targetDow - next.getDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setDate(next.getDate() + delta);
    return next;
  }
  // DAILY default
  next.setHours(agent.runHour, 0, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

// ============ Webhook push (Feishu / WeCom / Slack text format) ============

async function pushWebhook(url: string, title: string, content: string) {
  const text = `【${title}】\n${content.slice(0, 3500)}`;
  const bodies = [
    { msg_type: "text", content: { text } }, // Feishu
    { msgtype: "text", text: { content: text } }, // WeCom / DingTalk
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
        // Feishu/WeCom non-zero code/errcode means wrong format; try next
        if (data && (data.code === 0 || data.errcode === 0 || (data.code === undefined && data.errcode === undefined))) {
          return;
        }
      }
    } catch {
      // Try next format
    }
  }
}

// ============ Agent execution ============

export async function runAgent(
  agentId: string,
  triggeredBy: "manual" | "schedule" = "manual",
  emit?: TraceEmitter
): Promise<string> {
  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId }, include: { partner: true, createdBy: true } });

  const run = await db.agentRun.create({ data: { agentId: agent.id, status: "RUNNING" } });
  const toolLog: { tool: string; args: unknown; result: string }[] = [];

  try {
    const resolved = await resolveAgentSkills(agent.id, agent.skills);
    const skillNames = resolved.skillNames;
    const tools: (ToolDef | Record<string, unknown>)[] = buildToolsForAgent(skillNames);

    // Scope context
    let scopeCtx = "";
    if (agent.scopeType === "PARTNER" && agent.partnerId) {
      scopeCtx = `\n\n【Bound partner profile】\n${await partnerContext(agent.partnerId)}`;
    }

    const isZhAutomation =
      agent.isAutomation && /[\u4e00-\u9fff]/.test(`${agent.description ?? ""}\n${agent.instructions}`.slice(0, 800));
    const replyLang = isZhAutomation ? "Simplified Chinese (简体中文)" : "English";

    const automationPushRules =
      agent.isAutomation && (agent.wecomPushChatId || agent.pushEmailTo)
        ? [
            agent.wecomPushChatId
              ? `WeCom push chatId=${agent.wecomPushChatId} — after querying, call push_wecom with the FULL formatted body (include every todo line).`
              : "",
            agent.pushEmailTo
              ? `Default email for send_email: ${agent.pushEmailTo}`
              : "Do NOT call send_email unless task instructions explicitly require email.",
            !agent.pushEmailTo && agent.wecomPushChatId
              ? "User asked for group push only — do NOT send email."
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const automationRules = agent.isAutomation
      ? `
【Automation rules】
1. Follow TASK.md steps exactly; use list_todos when task mentions 待办/代办/todos.
2. Include EVERY line from list_todos in the push body — not just a count or summary.
3. Reply in ${replyLang}.
${automationPushRules ? `${automationPushRules}\n` : ""}4. Final message: count + full list (or "no open todos") + whether push succeeded.`
      : "";

    const system = agent.isAutomation
      ? `You are an automation pipeline in Fanruan's partner management system. Name: "${agent.name}".
Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}.
Run trigger: ${triggeredBy === "schedule" ? "scheduled" : "manual"}.

【Task instructions — follow exactly】
${agent.instructions}
${scopeCtx}
${automationRules}`
      : `You are an automated Agent in Fanruan's Middle East partner management system (Fanruan — leading Chinese BI vendor; products FineReport/FineBI/FineDataLink). Your name is "${agent.name}".
Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}.
This run: ${triggeredBy === "schedule" ? "scheduled automatic trigger" : "manual user trigger"}.
Always reply in English.

【Your task instructions】
${agent.instructions}
${scopeCtx}${agent.pushEmailTo ? `\n\n【Default email recipient for send_email】\n${agent.pushEmailTo}` : ""}
${resolved.promptFragments.length ? `\n【Additional skill hints】\n${resolved.promptFragments.join("\n\n")}` : ""}

【Working rules】
1. Use tools for real data; do not fabricate. When monitoring partners, prefer linkedin_search (company + executives), then web_search for news.
2. For Fanruan/Middle East strategy background, use search_knowledge first, then read_kms / write_kms for internal docs (if KMS token configured).
3. When you find valuable partner-related signals, use add_timeline_event on that partner's timeline (if tool enabled).
4. To change partner profile fields, call update_partner — the system converts to a proposal for human approval.
5. To push to a WeCom group during the run, use push_wecom with chatId from get_partner (WeCom group line) or list_wecom_chats. If not bound, skip push and mention in the final brief.
6. To send email, use send_email with explicit recipient address(es), subject, and body (requires team SMTP in Settings).
7. When done, output a final brief in Markdown (English): one-line conclusion first, then findings/recommendations/actions taken. If nothing new to report, say "No new findings this run" and summarize what was checked.
8. The brief is your final message; no tool call needed to send it.`;

    const chat: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: "Start the task." },
    ];

    const ctx = newSkillContext({
      mode: "agent",
      userId: agent.createdById,
      agentId: agent.id,
      agentName: agent.name,
    });

    let output = (await runToolLoop({
      chat,
      tools,
      temperature: 0.3,
      feature: `Agent run: ${agent.name}`,
      userId: agent.createdById ?? undefined,
      maxSteps: agentMaxSteps(agent),
      emit,
      executeTool: async (tc) => {
        if (tc.function.name === "$web_search") return tc.function.arguments;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* ignore */
        }
        const result = await runSkill(tc.function.name, args, ctx);
        toolLog.push({ tool: tc.function.name, args, result: result.slice(0, 500) });
        return result;
      },
    })) ?? "(Step limit reached; task may be incomplete. See log for actions taken.)";

    if (ctx.actions.length) {
      const appendix = `\n\n---\nActions taken:\n${ctx.actions.map((a) => `- ${a}`).join("\n")}`;
      output += appendix;
      if (emit) {
        emit({ event: "reply_delta", delta: appendix });
        emit({ event: "reply_done" });
      }
    }

    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", output, toolLog: JSON.stringify(toolLog), finishedAt: new Date() },
    });

    // Auto-save report agent output to the report center
    const isReportAgent = REPORT_AGENT_KEYWORDS.some((k) => agent.name.includes(k));
    if (isReportAgent && output) {
      const docType = /联合|joint/i.test(agent.name) ? "JOINT_SOLUTION" : "MEETING_PREP";
      await db.document.create({
        data: {
          title: `${agent.icon} ${agent.name} · ${new Date().toLocaleDateString("en-US")}`,
          type: docType,
          content: output,
          status: "DRAFT",
          partnerId: agent.partnerId,
          agentRunId: run.id,
          createdById: agent.createdById,
        },
      });
    }

    // Inbox notifications
    if (!agent.isAutomation || agent.notifyOnSuccess !== false) {
      await db.notification.create({
        data: {
          title: `${agent.icon} ${agent.name} run completed`,
          content: output,
          agentRunId: run.id,
          partnerId: agent.partnerId,
        },
      });
    }
    // Separate notification per pending proposal
    for (const p of ctx.pendingProposals) {
      await db.notification.create({
        data: {
          title: `${agent.icon} ${agent.name} proposed changes to "${p.partnerName}" profile`,
          content: p.fieldUpdates.map((f) => `${f.label}: ${f.oldValue ?? "(empty)"} → ${f.newValue}`).join("\n"),
          agentRunId: run.id,
          partnerId: p.partnerId,
          proposal: JSON.stringify(p),
        },
      });
    }

    // Webhook
    if (agent.webhookUrl) {
      await pushWebhook(agent.webhookUrl, `${agent.name}`, output);
    }

    const pushedWecomInRun = toolLog.some((t) => t.tool === "push_wecom");

    // 运行中已 push_wecom 时不再 post-run 重复推送；同一 chatId 也只推一次
    if (!pushedWecomInRun) {
      try {
        const { enqueueWecomPush } = await import("@/lib/wecom-push");
        const { getWecomChatForPartner } = await import("@/lib/wecom-chats");
        const text = `【${agent.icon} ${agent.name}】\n${output.slice(0, 3500)}`;
        const chatIds = new Set<string>();
        if (agent.wecomPushChatId?.trim()) chatIds.add(agent.wecomPushChatId.trim());
        if (agent.partnerId) {
          const partnerChat = await getWecomChatForPartner(agent.partnerId);
          if (partnerChat?.chatId) chatIds.add(partnerChat.chatId);
        }
        for (const chatId of chatIds) {
          try {
            await enqueueWecomPush(chatId, text);
          } catch (e) {
            console.warn(
              `[agent-runner] wecom push failed chatId=${chatId}:`,
              e instanceof Error ? e.message : e
            );
          }
        }
      } catch (e) {
        console.warn(`[agent-runner] post-run wecom push failed:`, e instanceof Error ? e.message : e);
      }
    }

    await db.agent.update({ where: { id: agent.id }, data: { lastRunAt: new Date() } });
    return output;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: msg, toolLog: JSON.stringify(toolLog), finishedAt: new Date() },
    });
    if (!agent.isAutomation || agent.notifyOnFailure !== false) {
      await db.notification.create({
        data: { title: `${agent.icon} ${agent.name} run failed`, content: msg, agentRunId: run.id },
      });
    }
    throw e;
  }
}

// ============ Scheduler (called every minute from instrumentation) ============

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
      // Advance nextRunAt first to avoid duplicate triggers on slow runs
      await db.agent.update({
        where: { id: agent.id },
        data: { nextRunAt: computeNextRunAt(agent) },
      });
      try {
        await runAgent(agent.id, "schedule");
      } catch (e) {
        console.error(`[agent-scheduler] ${agent.name} run failed:`, e);
      }
    }
  } catch (e) {
    console.error("[agent-scheduler] tick error:", e);
  } finally {
    ticking = false;
  }
}
