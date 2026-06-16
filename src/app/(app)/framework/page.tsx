import { requireUser } from "@/lib/session";
import { PageHeader, Card } from "@/components/ui";
import { PartnerFrameworkMap } from "@/components/partner-framework-map";
import {
  ACTION_DOMAIN_LABELS,
  PARTNER_ARCHETYPE_LABELS,
  VALUE_PATTERN_LABELS,
  buildFrameworkReferenceMap,
} from "@/lib/partner-framework";
import { PIPELINE_STAGES } from "@/lib/constants";

export default async function FrameworkPage() {
  await requireUser();
  const refMap = buildFrameworkReferenceMap();

  return (
    <div className="pb-16">
      <PageHeader
        title="伙伴经营框架"
        desc="定位 → 打法 → 动作 → 落地。Stage 决定做什么，Tier 决定做多狠，类型与价值模式决定怎么做。"
      />

      <div className="px-8 space-y-6">
        <PartnerFrameworkMap
          nodes={refMap}
          title="整体地图"
          subtitle="所有伙伴共用同一套框架；打开任意伙伴详情页可看到该伙伴的实例地图（当前值 + 就绪状态）。"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="三层定位 + 打法">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold text-indigo-700">定位层</dt>
                <dd className="text-zinc-600 mt-1">
                  <strong>Tier</strong> 投入强度 · <strong>Stage</strong> 关系进展 · <strong>伙伴类型</strong> 动作分支 · <strong>竞品基因</strong> 出身背景
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-indigo-700">打法层</dt>
                <dd className="text-zinc-600 mt-1">
                  <strong>联合价值模式</strong> 一起卖什么 · <strong>价值三行</strong> 伙伴/帆软/客户 · playbook + pitch
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-indigo-700">动作层（四域）</dt>
                <dd className="text-zinc-600 mt-1">
                  {Object.values(ACTION_DOMAIN_LABELS).join(" · ")}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="伙伴类型 → 动作分支">
            <ul className="space-y-2 text-sm">
              {Object.entries(PARTNER_ARCHETYPE_LABELS).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-zinc-400 shrink-0 font-mono text-xs">{k}</span>
                  <span className="text-zinc-700">{v}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-400 mt-3">
              纯渠道 / 空壳 → 动作是停止推进；泛集成 → 先确认 dedicated data team。
            </p>
          </Card>
        </div>

        <Card title="联合价值模式">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(VALUE_PATTERN_LABELS).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                <div className="font-medium text-zinc-800">{v}</div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{k}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Stage 3 初步判断 · Stage 4 定模式并 Demo · Stage 5 建 Solution 实例 · Stage 8 首单验证模式是否成立
          </p>
        </Card>

        <Card title="Pipeline 十阶段 · 各阶段焦点">
          <div className="space-y-2">
            {PIPELINE_STAGES.map((s) => (
              <div key={s.stage} className="flex gap-3 text-sm py-2 border-b border-zinc-50 last:border-0">
                <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {s.stage}
                </span>
                <div>
                  <div className="font-medium text-zinc-800">{s.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Tier 强度表（只改频率与资源，不改 Stage）">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="pb-2 pr-4"> </th>
                  <th className="pb-2 pr-4">Tier A</th>
                  <th className="pb-2 pr-4">Tier B</th>
                  <th className="pb-2">Tier C</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700">
                {[
                  ["接触频率", "≤7 天", "≤14 天", "≤30 天"],
                  ["会议深度", "尽量见 D", "见 champion", "异步为主"],
                  ["POC/驻场", "可申请驻场", "标准支持", "材料自助"],
                  ["认证目标", "高（L3+）", "中（L2+）", "低（L2）"],
                  ["停滞预警", "14 天", "21 天", "30 天"],
                ].map(([label, a, b, c]) => (
                  <tr key={label} className="border-b border-zinc-50">
                    <td className="py-2 pr-4 text-zinc-500">{label}</td>
                    <td className="py-2 pr-4">{a}</td>
                    <td className="py-2 pr-4">{b}</td>
                    <td className="py-2">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
