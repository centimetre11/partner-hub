/**
 * 商务记录解析 + 跟进确认项回归（无需 AI / 数据库）
 * 用法: npx tsx scripts/test-business-record-intake.ts
 */
import type { IntakeProposal } from "../src/lib/ai-intake";
import {
  enrichWeakBusinessRecordsFromPrimaryText,
  isIntakeClarificationFollowUp,
  isWeakBusinessRecordSourceText,
  isWeakBusinessRecordTitle,
  mergeBusinessRecordIntakeProposal,
} from "../src/lib/business-record-intake";
import {
  heuristicBusinessRecordTurn,
  primaryIntakeUserText,
} from "../src/lib/fast-intake-heuristic";

type Case = { name: string; pass: boolean; detail?: string };

function assert(name: string, pass: boolean, detail?: string): Case {
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, pass, detail };
}

const TODAY = "2026-06-24";
const EVENT =
  "举办 Smart Factory Opterium 沙特达曼 标杆市场活动，与 IICS 联合推广";

function emptyProposal(): IntakeProposal {
  return {
    summary: "",
    fields: [],
    contacts: [],
    opportunities: [],
    todos: [],
    trainings: [],
    solutions: [],
    businessRecords: [],
  };
}

function main() {
  const cases: Case[] = [];

  cases.push(assert("「现场商务」是弱确认项", isWeakBusinessRecordSourceText("现场商务")));
  cases.push(assert("「现场」是弱确认项", isWeakBusinessRecordSourceText("现场")));
  cases.push(assert("「接待」是弱确认项", isWeakBusinessRecordSourceText("接待")));
  cases.push(assert("活动描述不是弱项", !isWeakBusinessRecordSourceText(EVENT)));
  cases.push(
    assert(
      "【确认选择】是跟进确认",
      isIntakeClarificationFollowUp("【确认选择】\n1. 这次是现场还是非现场？：现场"),
    ),
  );

  cases.push(assert("弱标题检测：现场商务", isWeakBusinessRecordTitle("现场商务", "现场商务")));

  const enriched = enrichWeakBusinessRecordsFromPrimaryText(
    [{ title: "现场商务", content: "现场商务", category: "OTHER", traceNature: "现场", traceAction: "接待" }],
    EVENT,
  );
  cases.push(assert("弱记录从 primary 补全标题", enriched[0]?.title === EVENT, enriched[0]?.title));
  cases.push(assert("弱记录从 primary 补全正文", enriched[0]?.content === EVENT, enriched[0]?.content));
  cases.push(assert("CRM 字段保留", enriched[0]?.traceNature === "现场" && enriched[0]?.traceAction === "接待"));

  const prev: IntakeProposal = {
    ...emptyProposal(),
    summary: EVENT,
    businessRecords: [
      {
        title: EVENT,
        content: EVENT,
        category: "OTHER",
        traceNature: undefined,
        traceAction: undefined,
      },
    ],
  };
  const weakNext: IntakeProposal = {
    ...emptyProposal(),
    summary: "现场商务",
    businessRecords: [
      {
        title: "现场商务",
        content: "现场商务",
        category: "OTHER",
        traceNature: "现场",
        traceAction: "接待",
      },
    ],
  };
  const merged = mergeBusinessRecordIntakeProposal(prev, weakNext);
  cases.push(assert("merge 保留原始标题", merged.businessRecords[0]?.title === EVENT));
  cases.push(assert("merge 保留原始正文", merged.businessRecords[0]?.content === EVENT));
  cases.push(assert("merge 写入 traceNature", merged.businessRecords[0]?.traceNature === "现场"));
  cases.push(assert("merge 写入 traceAction", merged.businessRecords[0]?.traceAction === "接待"));

  const primary = primaryIntakeUserText(
    [
      { role: "user", content: EVENT },
      { role: "assistant", content: "请确认 CRM 字段" },
      { role: "user", content: "现场商务" },
    ],
    "business_record",
  );
  cases.push(assert("primaryIntakeUserText 跳过弱跟进", primary === EVENT, primary));

  const hEvent = heuristicBusinessRecordTurn(EVENT, "zh", TODAY);
  cases.push(assert("启发式：活动描述有草案", !!hEvent?.proposal.businessRecords[0]?.title?.includes("Smart Factory")));
  const hWeak = heuristicBusinessRecordTurn("现场商务", "zh", TODAY);
  cases.push(assert("启发式：现场商务 不单独成案", hWeak == null));

  const failed = cases.filter((c) => !c.pass);
  console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
  if (failed.length) {
    console.error("\nFailed:");
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main();
