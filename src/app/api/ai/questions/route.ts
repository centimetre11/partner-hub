import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { chatJson, AIError } from "@/lib/ai";
import { partnerContext } from "@/lib/proposals";
import { computeCompleteness } from "@/lib/completeness";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { partnerId } = await req.json();

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    include: { contacts: true, opportunities: true, events: true, trainings: true },
  });
  if (!partner) return NextResponse.json({ error: "伙伴不存在" }, { status: 404 });

  const { missing } = computeCompleteness(partner);
  const ctx = await partnerContext(partnerId);

  try {
    const res = await chatJson<{ questions: string[] }>(
      `你是帆软软件中东区 BD 的销售教练。基于伙伴档案的信息缺口，生成下次接触该伙伴时要问的问题清单（中文，6-10个问题）。
要求：问题要自然、具体、可以在商务对话中直接使用；优先覆盖缺失的关键信息（决策链、商机、竞品态度、客户资源）；结合该伙伴的具体背景定制，不要泛泛而谈。
只输出 JSON：{"questions": ["问题1", "问题2", ...]}`,
      `${ctx}\n\n【当前档案缺失项】\n${missing.join("、") || "无明显缺口"}`
    );
    return NextResponse.json({ questions: res.questions ?? [] });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "生成失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
