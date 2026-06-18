import { NextResponse } from "next/server";
import { getAiConfigSummary } from "@/lib/ai";
import { getWecomBotStatus } from "@/lib/wecom-bot";

export async function GET() {
  const [bot, ai] = await Promise.all([Promise.resolve(getWecomBotStatus()), getAiConfigSummary()]);
  return NextResponse.json({ ...bot, ai: bot.ai ?? ai });
}
