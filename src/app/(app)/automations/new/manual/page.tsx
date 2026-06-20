import { AutomationForm } from "@/components/automation-form";
import { DEFAULT_TASK_MD } from "@/lib/automation-defaults";
import { requireUser } from "@/lib/session";

export default async function ManualNewAutomationPage() {
  await requireUser();

  return (
    <AutomationForm
      initial={{
        slug: "",
        name: "",
        description: "",
        taskMd: DEFAULT_TASK_MD,
        triggerType: "SCHEDULE",
        cronExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        validityDays: 7,
        variables: [],
        maxIterations: 30,
        timeoutMinutes: 60,
        notifyOnSuccess: true,
        notifyOnFailure: true,
        wecomPushChatId: "",
        webhookUrl: "",
        enabled: true,
      }}
    />
  );
}
