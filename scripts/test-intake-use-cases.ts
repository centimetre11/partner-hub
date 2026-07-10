/**
 * 企微录入 · 积累 use case 回归矩阵（无需 AI）
 *
 * 覆盖「开放群 vs 绑定群」「@机器人」「global/GlobCom」等易回归场景。
 * 用法: npx tsx scripts/test-intake-use-cases.ts
 *
 * 可选：设置 DATABASE_URL 后会额外跑 sanitizeOpenIntakePartnerName（需 Hub 用户表）
 */
import type { IntakeProposal } from "../src/lib/ai-intake";
import {
  applyBoundContextToProposal,
  userTextMentionsPartnerName,
  sanitizeOpenIntakePartnerName,
} from "../src/lib/intake-partner-binding";
import {
  isLikelyWecomBotMentionName,
  stripWecomCommandPrefixForIntake,
} from "../src/lib/wecom-bot-intake";
import { parseTodoFromText } from "../src/lib/todo-intake-parse";
import { sanitizeProposalForScope } from "../src/lib/proposal-scope";
import { isListTodosAction, isProposeBuiltinAction, topBuiltinAction } from "../src/lib/intake-action-registry";

type Case = { id: string; name: string; pass: boolean; detail?: string };

function assert(id: string, name: string, pass: boolean, detail?: string): Case {
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
  return { id, name, pass, detail };
}

const TODAY = "2026-06-22";

function emptyProposal(partial?: Partial<IntakeProposal>): IntakeProposal {
  return {
    summary: "",
    fields: [],
    contacts: [],
    opportunities: [],
    todos: [],
    trainings: [],
    solutions: [],
    businessRecords: [],
    ...partial,
  };
}

function mainSync(): Case[] {
  const cases: Case[] = [];

  // ---- UC-OPEN-1：未绑定群 · @机器人 不是伙伴 ----
  const zatkaRaw =
    "@MENA Beard Gang 给宋健加一个待办关于 Zatka 项目的合同和首付款进度";
  cases.push(
    assert(
      "OPEN-1",
      "未绑定群：@MENA Beard Gang 识别为机器人",
      isLikelyWecomBotMentionName("MENA Beard Gang", zatkaRaw),
    ),
  );
  const zatkaBody = stripWecomCommandPrefixForIntake(zatkaRaw);
  cases.push(
    assert(
      "OPEN-1b",
      "未绑定群：strip 后保留「给宋健…」",
      zatkaBody.startsWith("给宋健"),
      zatkaBody,
    ),
  );
  const zatkaParsed = parseTodoFromText(zatkaBody, TODAY);
  cases.push(assert("OPEN-1c", "未绑定群：负责人=宋健", zatkaParsed.assigneeName === "宋健", zatkaParsed.assigneeName));
  cases.push(
    assert(
      "OPEN-1d",
      "未绑定群：标题含 Zatka 无命令词",
      zatkaParsed.title.includes("Zatka") && !/给宋健|加一个待办/.test(zatkaParsed.title),
      zatkaParsed.title,
    ),
  );

  // ---- UC-OPEN-2：未绑定群 · global 不是 GlobCom ----
  const jackieRaw = stripWecomCommandPrefixForIntake(
    "@MENA Beard Gang 帮我给 jackie 建个待办，约一下 global 线上认识一下，邀约大会",
  );
  cases.push(
    assert("OPEN-2", "未绑定群：global 非 GlobCom 明示", !userTextMentionsPartnerName(jackieRaw, "GlobCom")),
  );
  cases.push(
    assert(
      "OPEN-2b",
      "未绑定群：global 词不匹配 globcom token",
      !userTextMentionsPartnerName("约一下 global 线上", "GlobCom"),
    ),
  );
  const jackieParsed = parseTodoFromText(jackieRaw, TODAY);
  cases.push(assert("OPEN-2c", "未绑定群：负责人=jackie", jackieParsed.assigneeName?.toLowerCase() === "jackie"));
  cases.push(
    assert(
      "OPEN-2d",
      "未绑定群：标题保留 global 会议描述",
      jackieParsed.title.includes("global") && !/建个待办|帮我给/.test(jackieParsed.title),
      jackieParsed.title,
    ),
  );

  // ---- UC-OPEN-3：未绑定群 · 明示公司名可关联 ----
  cases.push(
    assert(
      "OPEN-3",
      "未绑定群：正文写 GlobCom 算明示",
      userTextMentionsPartnerName("给 GlobCom 的 jackie 建个待办", "GlobCom"),
    ),
  );
  cases.push(
    assert(
      "OPEN-3b",
      "未绑定群：AkLogiks 明示",
      userTextMentionsPartnerName("给 AkLogiks 记个待办，确认会议", "AkLogiks"),
    ),
  );

  // ---- UC-BOUND-1：GlobCom 绑定群 · 默认归属绑定伙伴 ----
  const boundIn = emptyProposal({
    partnerName: "WrongCo",
    fields: [{ field: "name", label: "公司全称", newValue: "MENA Beard Gang", oldValue: null, reason: "" }],
    todos: [{ title: "约一下 global 线上认识一下", assigneeName: "jackie" }],
  });
  const boundOut = applyBoundContextToProposal(boundIn, {
    boundPartnerId: "partner-globcom",
    boundPartnerName: "GlobCom",
    scope: "todo",
  });
  cases.push(assert("BOUND-1", "绑定群：归属 GlobCom", boundOut.partnerName === "GlobCom", boundOut.partnerName));
  cases.push(assert("BOUND-1b", "绑定群：hubPartnerId 写入", boundOut.hubPartnerId === "partner-globcom"));
  cases.push(assert("BOUND-1c", "绑定群：清掉误混 fields", boundOut.fields.length === 0));
  cases.push(assert("BOUND-1d", "绑定群：保留 todos", boundOut.todos.length === 1));

  const boundSanitized = sanitizeProposalForScope("todo", boundOut);
  cases.push(
    assert(
      "BOUND-1e",
      "绑定群：sanitize todo 仍无 fields",
      boundSanitized.fields.length === 0 && boundSanitized.partnerName === "GlobCom",
    ),
  );

  // ---- UC-BOUND-2：绑定群 · 无绑定时 applyBound 不变 ----
  const openPassthrough = applyBoundContextToProposal(boundIn, { scope: "todo" });
  cases.push(
    assert(
      "BOUND-2",
      "无绑定：applyBound 不改动 partnerName",
      openPassthrough.partnerName === "WrongCo",
      openPassthrough.partnerName,
    ),
  );

  // ---- UC-QUERY vs CREATE（jackie 待办查询回归）----
  cases.push(assert("Q-1", "「jackie的待办」不是创建", topBuiltinAction("jackie的待办")?.action.id !== "intake.todo"));
  cases.push(assert("Q-2", "「还有什么代办」是查询", isListTodosAction("还有什么代办")));
  cases.push(assert("Q-3", "「建个待办给 jackie」是创建", isProposeBuiltinAction("帮我给 jackie 建个待办，test")));

  // ---- UC-PARSE 负责人变体 ----
  cases.push(
    assert(
      "P-1",
      "areeb 负责人解析",
      parseTodoFromText("增加一个待办，update power map，负责人是areeb", TODAY).assigneeName === "areeb",
    ),
  );
  cases.push(
    assert(
      "P-2",
      "Zayne 记个待办给",
      parseTodoFromText("记个待办给 Zayne，smc test", TODAY).assigneeName === "Zayne",
    ),
  );

  return cases;
}

async function mainAsync(cases: Case[]): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("\n(skip) DATABASE_URL 未设置，跳过 sanitizeOpenIntakePartnerName 异步用例");
    return;
  }

  try {
    const openGlobal = await sanitizeOpenIntakePartnerName(
      emptyProposal({ partnerName: "GlobCom", todos: [{ title: "meet" }] }),
      { userText: jackieRawForAsync() },
    );
    cases.push(
      assert(
        "OPEN-ASYNC-1",
        "开放群：LLM 填 GlobCom + 正文仅 global → 清除 partnerName",
        !openGlobal.partnerName,
        openGlobal.partnerName ?? "(cleared)",
      ),
    );

    const openBot = await sanitizeOpenIntakePartnerName(
      emptyProposal({ partnerName: "MENA Beard Gang" }),
      { userText: "@MENA Beard Gang 给宋健加一个待办关于 Zatka" },
    );
    cases.push(assert("OPEN-ASYNC-2", "开放群：机器人名清除 partnerName", !openBot.partnerName));

    const openAk = await sanitizeOpenIntakePartnerName(
      emptyProposal({ partnerName: "AkLogiks", todos: [{ title: "x" }] }),
      { userText: "给 AkLogiks 记个待办，确认会议" },
    );
    cases.push(
      assert(
        "OPEN-ASYNC-3",
        "开放群：明示 AkLogiks 保留",
        openAk.partnerName === "AkLogiks",
        openAk.partnerName,
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`\n(skip) 异步用例因 DB 不可用跳过: ${msg.slice(0, 80)}`);
  }
}

function jackieRawForAsync(): string {
  return stripWecomCommandPrefixForIntake(
    "@MENA Beard Gang 帮我给 jackie 建个待办，约一下 global 线上认识一下，邀约大会",
  );
}

async function main() {
  console.log("=== 企微录入 use case 回归矩阵 ===\n");
  const cases = mainSync();
  await mainAsync(cases);

  const failed = cases.filter((c) => !c.pass);
  console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
  if (failed.length) {
    console.error("\nFailed:");
    for (const f of failed) console.error(`  [${f.id}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exitCode = 1;
    return;
  }

  console.log(`
矩阵摘要（改 partner/todo/wecom 前对照）:
┌──────────┬─────────────────────────────────────┬─────────────────────────────┐
│ 场景     │ 输入要点                            │ 期望 partnerName            │
├──────────┼─────────────────────────────────────┼─────────────────────────────┤
│ 开放群   │ @机器人 + 给宋健/Zatka 待办         │ 无（勿用机器人名）          │
│ 开放群   │ jackie + global 线上（无 GlobCom）  │ 无（global≠GlobCom）        │
│ 开放群   │ 明示 AkLogiks / GlobCom             │ 可关联对应公司              │
│ 绑定群   │ GlobCom 群 + 任意待办正文           │ 强制 GlobCom（群绑定优先）  │
│ 查询     │ jackie的待办 / 还有什么代办         │ 走 list_todos，非创建       │
└──────────┴─────────────────────────────────────┴─────────────────────────────┘
`);
}

main();
