import { NextResponse } from "next/server";
import { listHubUsersWithCrmAccount } from "@/lib/business-record-core";
import { requireUser } from "@/lib/session";

/** 返回已绑定 CRM 账号的 Hub 成员（商务记录同行人候选） */
export async function GET() {
  const user = await requireUser();
  const crmRecorders = await listHubUsersWithCrmAccount();
  return NextResponse.json({
    currentUserId: user.id,
    crmRecorders,
  });
}
