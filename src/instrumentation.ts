// Next.js 启动钩子：拉起 Agent 定时调度器（每分钟检查一次到期的定时 Agent）
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { schedulerTick } = await import("./lib/agent-runner");
    setInterval(() => {
      schedulerTick();
    }, 60 * 1000);
    console.log("[agent-scheduler] Started — checking scheduled agents every minute");
  }
}
