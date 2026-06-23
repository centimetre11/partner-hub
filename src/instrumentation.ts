// Next.js 启动钩子：拉起 Agent 定时调度器 + 企业微信智能机器人（可选）
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { schedulerTick } = await import("./lib/agent-runner");
    setInterval(() => {
      schedulerTick();
    }, 60 * 1000);
    console.log("[agent-scheduler] Started — checking scheduled agents every minute");

    setInterval(() => {
      void import("./lib/crm-scheduler").then(({ crmSchedulerTick }) => crmSchedulerTick());
    }, 60 * 1000);
    console.log("[crm-scheduler] Started — checking CRM sync every minute");

    setInterval(() => {
      void import("./lib/leads-scheduler").then(({ leadsSchedulerTick }) => leadsSchedulerTick());
    }, 60 * 1000);
    console.log("[leads-scheduler] Started — checking leads sync every minute");

    if (process.env.WECOM_BOT_AUTOSTART === "1") {
      const g = globalThis as typeof globalThis & {
        __wecomBotStop?: () => void;
      };
      g.__wecomBotStop?.();
      const { startWecomBot } = await import("./lib/wecom-bot");
      const handle = await startWecomBot();
      g.__wecomBotStop = handle.stop;
    }
  }
}
