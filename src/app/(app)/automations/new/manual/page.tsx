import { redirect } from "next/navigation";

/** 旧路径 → 默认手动创建页 */
export default function LegacyManualAutomationPage() {
  redirect("/automations/new");
}
