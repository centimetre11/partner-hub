import { NextResponse } from "next/server";
import { getWecomOAuthPublicConfig } from "@/lib/wecom-oauth";

export async function GET() {
  return NextResponse.json(getWecomOAuthPublicConfig());
}
