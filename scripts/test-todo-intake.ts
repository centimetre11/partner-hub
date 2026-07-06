/**
 * 待办解析 + 启发式 + 回归用例（无需 AI / 数据库）
 * 用法: npx tsx scripts/test-todo-intake.ts
 */
import {
  isListTodosAction,
  isProposeBuiltinAction,
  topBuiltinAction,
} from "../src/lib/intake-action-registry";
import { isProposeConfirm, shouldUseProposeMode } from "../src/lib/ai-intake";
import {
  heuristicFastIntakeTurn,
  lastIntakeUserText,
  stripIntakeCommandPrefix,
} from "../src/lib/fast-intake-heuristic";
import { parseTodoFromText, resolveSelfAssigneeNames } from "../src/lib/todo-intake-parse";
import { isIntakeParseErrorReply } from "../src/lib/intake-text";
import { extractPartnerNameFromIntakeText } from "../src/lib/intake-partner-binding";
import { isLikelyWecomBotMentionName, stripWecomCommandPrefixForIntake } from "../src/lib/wecom-bot-guide";

type Case = { name: string; pass: boolean; detail?: string };

function assert(name: string, pass: boolean, detail?: string): Case {
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, pass, detail };
}

const TODAY = "2026-06-22";

function main() {
  const cases: Case[] = [];

  // ---- parseTodoFromText（变更对照 · 企微待办）----
  const areeb = parseTodoFromText("增加一个待办，update power map，负责人是areeb", TODAY);
  cases.push(assert("areeb：标题", areeb.title === "update power map", areeb.title));
  cases.push(assert("areeb：负责人", areeb.assigneeName === "areeb", areeb.assigneeName));
  cases.push(assert("areeb：无 priority 字段", areeb.priority == null));

  const zayne = parseTodoFromText("记个待办给 Zayne，smc 做出历史最佳标杆", TODAY);
  cases.push(assert("Zayne：标题", zayne.title === "smc 做出历史最佳标杆", zayne.title));
  cases.push(assert("Zayne：负责人", zayne.assigneeName === "Zayne", zayne.assigneeName));

  const selfTodo = parseTodoFromText("给我加个待办，摸清华为云金融的权力地图", TODAY);
  cases.push(assert("给我：标题", selfTodo.title === "摸清华为云金融的权力地图", selfTodo.title));
  cases.push(assert("给我：负责人=我", selfTodo.assigneeName === "我", selfTodo.assigneeName));

  const hSelf = heuristicFastIntakeTurn("todo", "给我加个待办，摸清华为云金融的权力地图", "zh", TODAY);
  cases.push(assert("heuristic 给我 ready", hSelf?.ready === true));
  cases.push(assert("heuristic 给我 标题", hSelf?.proposal.todos[0]?.title === "摸清华为云金融的权力地图"));
  cases.push(assert("heuristic 给我 负责人", hSelf?.proposal.todos[0]?.assigneeName === "我"));
  cases.push(
    assert(
      "heuristic 给我 summary 不含命令词",
      hSelf?.proposal.summary === "摸清华为云金融的权力地图",
      hSelf?.proposal.summary,
    ),
  );

  const resolved = resolveSelfAssigneeNames(hSelf!.proposal, "陈敏");
  cases.push(
    assert(
      "resolveSelfAssigneeNames 我→操作人",
      resolved.todos[0]?.assigneeName === "陈敏",
      resolved.todos[0]?.assigneeName,
    ),
  );

  const enTodo = parseTodoFromText("add todo: follow up contract, assignee: areeb", TODAY);
  cases.push(assert("英文 add todo", enTodo.title?.includes("follow up contract") ?? false, enTodo.title));
  cases.push(assert("英文 assignee", enTodo.assigneeName === "areeb", enTodo.assigneeName));

  // ---- lastIntakeUserText + heuristic（剥命令词后仍应识别）----
  const wecomZayne = lastIntakeUserText(
    [{ role: "user", content: "@MENA Beard Gang 记个待办给 Zayne，smc 做出历史最佳标杆" }],
    "todo",
  );
  cases.push(assert("企微 Zayne userText 非空", !!wecomZayne, wecomZayne));
  const hZayne = heuristicFastIntakeTurn("todo", wecomZayne, "zh", TODAY);
  cases.push(
    assert(
      "heuristic Zayne 有草案",
      !!hZayne?.proposal.todos[0]?.title && hZayne.proposal.todos[0]?.assigneeName === "Zayne",
      JSON.stringify(hZayne?.proposal.todos[0]),
    ),
  );
  cases.push(
    assert(
      "heuristic Zayne 非 JSON 报错",
      !isIntakeParseErrorReply(hZayne?.reply),
      hZayne?.reply?.slice(0, 40),
    ),
  );

  const wecomAreeb = lastIntakeUserText(
    [{ role: "user", content: "增加一个待办，update power map，负责人是areeb" }],
    "todo",
  );
  const hAreeb = heuristicFastIntakeTurn("todo", wecomAreeb, "zh", TODAY);
  cases.push(assert("heuristic areeb ready", hAreeb?.ready === true));
  cases.push(assert("heuristic areeb 标题", hAreeb?.proposal.todos[0]?.title === "update power map"));

  // ---- 查询 vs 创建（list_todos 回归）----
  cases.push(assert("「现在多少待办」是查询句式", isListTodosAction("现在多少待办")));
  cases.push(
    assert(
      "「jackie的待办」走 LLM 查询（非 create 正则）",
      topBuiltinAction("jackie的待办")?.action.id !== "intake.todo",
      topBuiltinAction("jackie的待办")?.action.id ?? "general/LLM",
    ),
  );
  cases.push(assert("「记个待办给 Zayne」是创建", isProposeBuiltinAction("记个待办给 Zayne，test")));
  cases.push(
    assert(
      "查询不进 Propose",
      !shouldUseProposeMode([{ role: "user", content: "现在多少待办" }]),
    ),
  );

  // ---- @确认 ----
  cases.push(assert("@MENA Beard Gang 确认", isProposeConfirm("@MENA Beard Gang 确认")));
  cases.push(assert("裸 确认", isProposeConfirm("确认")));

  // ---- 人名不当 partnerName ----
  cases.push(
    assert(
      "Zayne 不从正文抽 partner",
      extractPartnerNameFromIntakeText("记个待办给 Zayne，smc test") == null,
    ),
  );

  // ---- business_record strip 不误伤（回归）----
  const br = stripIntakeCommandPrefix("帮我记一下商务记录，见了客户 VP", "business_record");
  cases.push(assert("商务记录 strip 保留正文", br.includes("见了"), br));

  // ---- list 回复格式（无 priority 前缀仍可读）----
  const withPri = "[id:todo1] [HIGH] 与 MENA 确认会议 | Partner:AkLogiks";
  const withoutPri = "[id:todo2] 与 MENA 确认会议 | Partner:AkLogiks";
  const idRe = /^\[id:([^\]]+)\]/;
  cases.push(assert("list 格式含 priority 可解析", idRe.test(withPri)));
  cases.push(assert("list 格式无 priority 可解析", idRe.test(withoutPri)));

  // ---- 代办 + 企微 @ 负责人 ----
  cases.push(assert("「还有什么代办」是查询", isListTodosAction("还有什么代办")));
  cases.push(assert("「加一条代办」是创建", isProposeBuiltinAction("加一条代办给 Zayne，test")));

  const wecomAssignee = parseTodoFromText(
    "加一条代办给@XuShengkai-徐圣凯，下周来见一下技术团队探明",
    TODAY,
  );
  cases.push(
    assert(
      "企微 @ 负责人",
      wecomAssignee.assigneeName === "徐圣凯",
      wecomAssignee.assigneeName,
    ),
  );
  cases.push(
    assert(
      "企微 @ 标题不含命令前缀",
      wecomAssignee.title === "下周来见一下技术团队探明",
      wecomAssignee.title,
    ),
  );

  const songjian = parseTodoFromText(
    stripWecomCommandPrefixForIntake("@MENA Beard Gang 给宋健加一个待办关于 Zatka 项目的合同和首付款进度"),
    TODAY,
  );
  cases.push(assert("给宋健加一个待办：负责人", songjian.assigneeName === "宋健", songjian.assigneeName));
  cases.push(
    assert(
      "给宋健加一个待办：标题",
      songjian.title.includes("Zatka") && !/给宋健|加一个待办/.test(songjian.title),
      songjian.title,
    ),
  );
  cases.push(
    assert(
      "@MENA Beard Gang 不是伙伴名",
      isLikelyWecomBotMentionName(
        "MENA Beard Gang",
        "@MENA Beard Gang 给宋健加一个待办关于 Zatka 项目的合同和首付款进度",
      ),
    ),
  );
  cases.push(
    assert(
      "正文不含 @ 时不误判机器人",
      !isLikelyWecomBotMentionName("AkLogiks", "给 areeb 记两个待办"),
    ),
  );

  const failed = cases.filter((c) => !c.pass);
  console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
  if (failed.length) {
    console.error("\nFailed:");
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main();
