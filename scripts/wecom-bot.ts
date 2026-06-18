/**
 * 独立运行企业微信智能机器人（长连接模式）
 * 用法：npm run wecom-bot
 */
import { startWecomBot, stopWecomBot } from "../src/lib/wecom-bot";

async function main() {
  const handle = await startWecomBot();
  process.on("SIGINT", () => {
    handle.stop();
    stopWecomBot();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    handle.stop();
    stopWecomBot();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[wecom-bot] 启动失败:", err);
  process.exit(1);
});
