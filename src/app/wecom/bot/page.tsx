import Link from "next/link";
import {
  resolveWecomBotDisplayName,
  wecomMobileAiOAuthUrl,
} from "@/lib/wecom-bot-guide";

export const metadata = {
  title: "和 AI 助手对话",
};

export default function WecomBotGuidePage() {
  const botName = resolveWecomBotDisplayName();
  const mobileUrl = wecomMobileAiOAuthUrl();

  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-slate-800">
      <h1 className="text-xl font-semibold text-slate-900">Partner Hub AI</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        查待办、搜伙伴、录商务记录。任选一种方式继续：
      </p>

      <div className="mt-6 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">方式一：移动工作台（推荐）</h2>
          <p className="mt-1 text-sm text-slate-500">在企微内直接打开网页助手，无需找机器人。</p>
          <Link
            href={mobileUrl}
            className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            打开移动工作台
          </Link>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">方式二：智能机器人私聊</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
            <li>打开企微「工作台」</li>
            <li>进入「智能机器人」或顶部搜索</li>
            <li>搜索并打开「{botName}」</li>
            <li>发起私聊，直接输入问题（无需 @）</li>
          </ol>
        </section>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        群聊场景请在已添加机器人的群里 @ 机器人提问。
      </p>
    </main>
  );
}
