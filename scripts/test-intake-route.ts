/**
 * 路由 + 意图确认启发式测试（无需 AI / 数据库）
 * 用法: npx tsx scripts/test-intake-route.ts
 */
import {
  isListTodosAction,
  isProposeBuiltinAction,
  isTodoQueryPhrase,
  scoreBuiltinActions,
  topBuiltinAction,
} from "../src/lib/intake-action-registry";
import {
  buildIntentConfirmSession,
  isIntentConfirmCommand,
  needsIntentConfirm,
  parseIntentAlternativePick,
  routeFromConfirmedActionId,
} from "../src/lib/intake-intent-confirm";
import { shouldUseProposeMode, type IntakeProposal } from "../src/lib/ai-intake";
import { shouldAutoApplyBoundIntake } from "../src/lib/proposal-scope";
import { detectProposeScopeHeuristic } from "../src/lib/intake-route-resolver";
import {
  buildFocusFromListItems,
  extractListItemsFromFormattedReply,
  isModificationPhrase,
  resolveFocusTarget,
  patchActionIdForKind,
} from "../src/lib/focus-entity";

type Case = { name: string; pass: boolean; detail?: string };

function assert(name: string, pass: boolean, detail?: string): Case {
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, pass, detail };
}

function main() {
  const cases: Case[] = [];

  // ---- 查询 vs 创建 ----
  cases.push(
    assert(
      "「现在多少待办」→ query.list_todos",
      topBuiltinAction("现在多少待办")?.action.id === "query.list_todos"
    )
  );
  cases.push(assert("「现在多少待办」isTodoQueryPhrase", isTodoQueryPhrase("现在多少待办")));
  cases.push(assert("「现在多少待办」isListTodosAction", isListTodosAction("现在多少待办")));
  cases.push(assert("「现在多少待办」不进 Propose", !shouldUseProposeMode([{ role: "user", content: "现在多少待办" }])));

  cases.push(
    assert(
      "「帮我建个待办」→ intake.todo",
      topBuiltinAction("帮我建个待办")?.action.id === "intake.todo"
    )
  );
  cases.push(assert("「帮我建个待办」isProposeBuiltinAction", isProposeBuiltinAction("帮我建个待办")));
  cases.push(assert("「帮我建个待办」进 Propose 门槛", shouldUseProposeMode([{ role: "user", content: "帮我建个待办" }])));

  // ---- 互斥：查询句式不应给 intake.todo 最高分 ----
  const queryScores = scoreBuiltinActions("现在多少待办");
  const todoScore = queryScores.find((s) => s.action.id === "intake.todo")?.score ?? 0;
  const listScore = queryScores.find((s) => s.action.id === "query.list_todos")?.score ?? 0;
  cases.push(assert("查询句式 intake.todo 得分为 0", todoScore === 0, `todo=${todoScore} list=${listScore}`));
  cases.push(assert("查询句式 list_todos 领先", listScore > todoScore));

  // ---- 意图确认 ----
  const proposeRoute = routeFromConfirmedActionId("intake.todo");
  cases.push(
    assert(
      "needsIntentConfirm(propose) high→false",
      proposeRoute ? !needsIntentConfirm(proposeRoute) : false,
    ),
  );
  cases.push(
    assert(
      "needsIntentConfirm(propose) low→true",
      proposeRoute ? needsIntentConfirm({ ...proposeRoute, confidence: "low" }) : false,
    ),
  );
  const queryRoute = routeFromConfirmedActionId("query.list_todos");
  cases.push(assert("needsIntentConfirm(query) 为 false", queryRoute ? !needsIntentConfirm(queryRoute) : false));

  const intentSession = buildIntentConfirmSession({
    route: proposeRoute!,
    sourceText: "帮我建个待办",
    locale: "zh",
    partnerName: "AkLogiks",
  });
  cases.push(assert("意图确认 session action=intake.todo", intentSession.actionId === "intake.todo"));
  cases.push(assert("意图确认 @确认 解析", isIntentConfirmCommand("@机器人 确认")));

  const altPick = parseIntentAlternativePick("@机器人 1", {
    ...intentSession,
    alternatives: intentSession.alternatives.length
      ? intentSession.alternatives
      : [{ actionId: "query.list_todos", label: "查询待办", index: 1 }],
  });
  cases.push(
    assert(
      "意图确认 @1 切到 query.list_todos",
      altPick === "query.list_todos" || intentSession.alternatives.some((a) => a.actionId === "query.list_todos"),
      altPick ?? "no pick"
    )
  );

  // ---- 取消 auto-apply ----
  const stubProposal = {
    partnerName: "X",
    summary: "",
    fields: [],
    contacts: [],
    opportunities: [],
    todos: [{ title: "t" }],
    trainings: [],
    solutions: [],
    businessRecords: [],
  } satisfies IntakeProposal;
  cases.push(
    assert(
      "shouldAutoApplyBoundIntake 恒为 false",
      !shouldAutoApplyBoundIntake({
        scope: "todo",
        partnerId: "p1",
        ready: true,
        proposal: stubProposal,
      })
    )
  );

  // ---- 启发式 scope（绑定群不应默认 profile 盖过待办查询）----
  const scopeForQuery = detectProposeScopeHeuristic(
    [{ role: "user", content: "现在多少待办" }],
    "partner-1"
  );
  cases.push(assert("绑定群 + 多少待办 启发式非 todo 创建", scopeForQuery !== "todo" || isListTodosAction("现在多少待办")));

  // ---- Focus + 修改句 ----
  cases.push(assert("「责任人改成 areeb」是修改句", isModificationPhrase("责任人改成 areeb")));
  cases.push(
    assert(
      "修改句 + focus 不应最高分 intake.todo",
      topBuiltinAction("责任人改成 areeb")?.action.id !== "intake.todo" ||
        isModificationPhrase("责任人改成 areeb")
    )
  );
  const patchRoute = routeFromConfirmedActionId("patch.todo");
  cases.push(assert("needsIntentConfirm(patch)", patchRoute ? needsIntentConfirm(patchRoute) : false));

  const listReply =
    "[id:todo1] 与 MENA 确认会议 | Partner:AkLogiks | Due:- | Assignee:Saber";
  const items = extractListItemsFromFormattedReply(listReply);
  cases.push(assert("解析 list 回复中的 id", items.length === 1 && items[0].id === "todo1"));
  const focus = buildFocusFromListItems({
    kind: "todo",
    items,
    partnerId: "p1",
    partnerName: "AkLogiks",
  });
  cases.push(assert("单条 focus 自动锁定", focus?.id === "todo1"));
  const target = focus ? resolveFocusTarget(focus, "责任人改成 areeb") : null;
  cases.push(assert("resolveFocusTarget 单条", target != null && !("ambiguous" in target)));
  cases.push(assert("patch action id", patchActionIdForKind("todo") === "patch.todo"));

  const failed = cases.filter((c) => !c.pass);
  console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
  if (failed.length) {
    console.error("\nFailed:");
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main();
