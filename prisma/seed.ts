/**
 * 种子数据：来自《Kimi_Agent_中东BI合作伙伴》材料
 * - fanru_partner_list_data_bi_v3.md（62家清单，AI验证+人工核对状态）
 * - fanru_ops_playbook_v2.md（Tier A/B/C 分级、打法、联系人、12周行动时间线）
 * 全部导入为「候选池」（status=PROSPECT），确认后在系统中转正。
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type SeedContact = {
  name: string;
  role: string;
  title?: string;
  contactInfo?: string;
  approach?: string;
};

type SeedPartner = {
  name: string;
  category: string;
  tier?: string;
  city?: string;
  country?: string;
  headcount?: string;
  website?: string;
  capability?: string;
  knownClients?: string;
  certLevel?: string;
  currentTools?: string;
  keyDifferentiator?: string;
  playbook?: string;
  bestChannel?: string;
  aiVerified?: string;
  priority?: string;
  fitScore?: number;
  contacts?: SeedContact[];
};

const partners: SeedPartner[] = [
  // ===== Tier A（立即打，来自作战清单 v2） =====
  {
    name: "Beinex", category: "TABLEAU", tier: "A", city: "迪拜 / 利雅得", country: "UAE / KSA",
    headcount: "51-200人", website: "beinex.com",
    capability: "Tableau 高端可视化实施，兼做 Qlik", knownClients: "Baladna(Qatar)、DoH-Abu Dhabi、SACO、55+客户",
    certLevel: "中东唯一 Tableau Premier Partner", currentTools: "Tableau / Qlik",
    keyDifferentiator: "中东唯一 Tableau Premier，生态动荡期最易转向",
    playbook: "Tableau生态脆弱（Salesforce裁员、Einstein Alliance只收25家），推「Tableau+帆软双持」互补策略，提供 Arabic RTL Demo",
    bestChannel: "LinkedIn 联系 CEO → 技术 Demo 邀请", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [
      { name: "Shantosh Sridhar", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Shantosh Sridhar Beinex", approach: "LinkedIn 直接联系" },
      { name: "Rahul Vijayan", role: "EVALUATOR", title: "CTO", },
      { name: "Hamid Khan", role: "SUPPORTER", title: "COO", },
    ],
  },
  {
    name: "TechMantra", category: "POWER_BI", tier: "A", city: "迪拜 / 利雅得", country: "UAE / KSA",
    headcount: "201-500人", website: "techmantraglobal.com",
    capability: "Microsoft 全栈，BI 是核心板块", knownClients: "DAMAC Group（5年+）、KPMG India、Evercare",
    certLevel: "Microsoft Gold Partner，12项认证", currentTools: "Power BI",
    keyDifferentiator: "唯一 UAE+沙特双实体的微软 Gold 伙伴",
    playbook: "Power BI 企业级限制（1GB上限、涨价40%）→推 FineReport 填补复杂报表空白，「Power BI+帆软」联合方案",
    bestChannel: "LinkedIn 联系 CEO → 华为云联合引荐", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [{ name: "Srinivas Singh", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Srinivas Singh TechMantra" }],
  },
  {
    name: "Bilytica", category: "POWER_BI", tier: "A", city: "利雅得 / 达曼 / 吉达", country: "KSA",
    headcount: "50-200人", website: "bilytica.com",
    capability: "BI 实施 + 政府项目，Snowflake 认证", knownClients: "Anumara Capital、Ooredoo、McKinsey & Company、600+全球客户（200+沙特）",
    certLevel: "Microsoft Solutions Partner + AWS Advanced", currentTools: "Power BI",
    keyDifferentiator: "SDAIA 战略伙伴、政府关系强",
    playbook: "政府关系强+规模大→推「嵌入式BI/OEM合作」，成为帆软在沙特的门面代理，政府项目联合投标",
    bestChannel: "SDAIA 活动引荐 → LinkedIn 联系 CEO", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [
      { name: "Usman Ahmad", role: "DECISION_MAKER", title: "CEO（帝国理工计算机安全硕士）", contactInfo: "LinkedIn: Usman Ahmad Bilytica" },
      { name: "Dr. Sari Al Qahtani", role: "SUPPORTER", title: "沙特国家总监", },
    ],
  },
  {
    name: "DataPlus", category: "PURE_DATA", tier: "A", city: "利雅得", country: "KSA",
    headcount: "11-50人", website: "dataplus.sa",
    capability: "数据治理 + NDMO 合规 + BI 咨询", knownClients: "Purity IT（9614.SR，2025年4月战略合作）、沙特政府",
    certLevel: "DAMA 生态成员", currentTools: "Tableau",
    keyDifferentiator: "DAMA Saudi - Riyadh 分会创始负责人所在公司，政府信任壁垒",
    playbook: "DAMA 生态入口→「数据治理(DataPlus)+BI工具(帆软)+数据集成(帆软)」闭环联合方案，通过 DAMA Saudi 活动建立信任",
    bestChannel: "DAMA Saudi 活动见面 → LinkedIn", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [{ name: "Mosaab Alharbi", role: "DECISION_MAKER", title: "创始人/CEO", contactInfo: "LinkedIn: Mosaab Alharbi DataPlus", approach: "DAMA 活动见面" }],
  },
  {
    name: "SEIDOR / Clariba", category: "TABLEAU", tier: "A", city: "利雅得 / 迪拜 / 巴塞罗那", country: "KSA / UAE / Spain",
    headcount: "全球6000+人，Clariba 250+分析顾问", website: "seidor.com",
    capability: "SAP + Tableau + Dataiku 多生态分析咨询", knownClients: "Hoshan Holding、McDonald's UAE、Baladna、Qatar Gas、ADDC",
    certLevel: "SAP / Microsoft / Dataiku 合作伙伴", currentTools: "SAP Analytics Cloud / Tableau / Qlik",
    keyDifferentiator: "正在利雅得招聘 Analytics/AI Sales——沙特扩张窗口期",
    playbook: "推「SAP+帆软」混合方案：SAP Analytics Cloud + FineReport，Clariba 250+顾问是天然实施力量",
    bestChannel: "LinkedIn 联系 Marc Haberland → 利雅得办公室拜访", aiVerified: "VERIFIED", priority: "P0", fitScore: 8,
    contacts: [
      { name: "Marc Haberland", role: "EVALUATOR", title: "Head of Analytics", contactInfo: "LinkedIn: Marc Haberland SEIDOR" },
      { name: "Ignacio Ruiz", role: "DECISION_MAKER", title: "MD", },
    ],
  },
  {
    name: "KASP", category: "IT_INTEGRATOR", tier: "A", city: "科威特城", country: "Kuwait",
    headcount: "100-200人", website: "kasp.com.kw",
    capability: "BI 先驱（自1998）、SAP BusinessObjects 实施", knownClients: "CBK、KFH、NBK、Gulf Bank、Boubyan、Warba、Ahli United 等科威特几乎所有银行",
    certLevel: "SAP Gold Partner", currentTools: "SAP BO",
    keyDifferentiator: "科威特银行业全覆盖（11家银行客户）",
    playbook: "推「SAP BO 替代」方案：FineReport 替代 SAP BO，提供 POC + TCO 计算，通过 KASP 一次覆盖11家银行",
    bestChannel: "华为云引荐（KASP 是华为云伙伴）→ 直接拜访", aiVerified: "VERIFIED", priority: "P0", fitScore: 8,
    contacts: [{ name: "Dr. Magd Donia", role: "DECISION_MAKER", title: "总经理", contactInfo: "LinkedIn: Magd Donia KASP Kuwait", approach: "华为云引荐" }],
  },
  {
    name: "Datahub Analytics", category: "PURE_DATA", tier: "A", city: "安曼 / 利雅得", country: "Jordan / KSA",
    headcount: "11-50人", website: "datahubanalytics.com",
    capability: "大数据分析、BI 咨询，15,000+ 仪表盘交付", knownClients: "AIG、55+区域客户、60+项目",
    certLevel: "Tableau Partner", currentTools: "Tableau / Power BI 双持",
    keyDifferentiator: "约旦首家数据分析公司，纯数据公司认知对齐，合作意愿预期最高",
    playbook: "低成本切换：提供 Tableau→FineBI 转换培训和工具，覆盖 Tableau/Power BI 服务不了的新客户",
    bestChannel: "LinkedIn → 行业活动", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [{ name: "Ruba al-Tarawneh", role: "DECISION_MAKER", title: "联合创始人/BI负责人", contactInfo: "LinkedIn: Ruba al-Tarawneh Datahub" }],
  },
  {
    name: "BEMEA", category: "POWER_BI", tier: "A", city: "迪拜", country: "UAE",
    headcount: "50-200人", website: "bemea.com",
    capability: "中东最大 Power BI 伙伴之一，300+客户", knownClients: "Emicool、Liwa Education、Dubai Culture Authority、250+客户",
    certLevel: "Microsoft Solutions Partner Data & AI (Advanced)，Clutch 5.0", currentTools: "Power BI",
    keyDifferentiator: "中东头部 Power BI 服务商，正在招聘 KSA BD（进沙特窗口期）",
    playbook: "250+客户中有大量 Power BI 不满的（1GB限制、涨价40%）→推「Power BI+帆软」互补，留客户多赚服务费",
    bestChannel: "LinkedIn → KSA BD Manager 招聘窗口", aiVerified: "VERIFIED", priority: "P0", fitScore: 9,
    contacts: [{ name: "Johnny Youssef", role: "DECISION_MAKER", title: "创始人", contactInfo: "LinkedIn: Johnny Youssef BEMEA" }],
  },
  {
    name: "Ejada Systems", category: "IT_INTEGRATOR", tier: "A", city: "利雅得", country: "KSA",
    headcount: "大型（Al Rajhi Bank 子公司）", website: "ejada.com",
    capability: "综合 IT 服务 + 多 BI 工具实施", knownClients: "Al Rajhi Bank（母公司）、NEOM、GACA、14个新政府客户、587份合同/年",
    certLevel: "Tableau Premier + Microsoft + Qlik + Denodo", currentTools: "Tableau / Power BI / Qlik / Denodo",
    keyDifferentiator: "Al Rajhi Bank 子公司、政府合同量巨大",
    playbook: "多重身份+政府项目多→推「帆软加入工具箱」方案不替代现有工具，华为云引荐+政府项目联合投标",
    bestChannel: "华为云引荐（最高优先级）", aiVerified: "VERIFIED", priority: "P0", fitScore: 8,
    contacts: [{ name: "Mohammed Hassoobh", role: "DECISION_MAKER", title: "代理CEO", contactInfo: "LinkedIn: Mohammed Hassoobh Ejada", approach: "华为云引荐" }],
  },
  {
    name: "Future Systems", category: "PURE_DATA", tier: "A", city: "利雅得", country: "KSA",
    headcount: "未公开（AI网络110K+）", website: "fs-consulting.co",
    capability: "沙特本土 BI 咨询，Vision 2030 项目", knownClients: "零售（+20%收入案例）、制造（-15%成本）、物流（+30%满意度）",
    currentTools: "Power BI / Tableau / Qlik 三持",
    keyDifferentiator: "本土三工具咨询，缺第4个差异化工具",
    playbook: "推全产品线独家代理方案：不依赖云、能做中国式复杂报表的工具，利雅得区域独家代理权谈判",
    bestChannel: "直接拜访利雅得办公室", aiVerified: "VERIFIED", priority: "P0", fitScore: 8,
    contacts: [{ name: "Ayman al Jehane", role: "DECISION_MAKER", title: "MD", contactInfo: "LinkedIn: Ayman al Jehane Future Systems Saudi" }],
  },

  // ===== Tier B（重点打） =====
  {
    name: "SOL Analytics", category: "TABLEAU", tier: "B", city: "迪拜", country: "UAE",
    headcount: "11-20人", website: "solanalytics.com",
    capability: "Tableau + Dataiku 实施", knownClients: "ENOC、Arabian Automobiles(Nissan)、Emax、Rasasi Perfumes",
    currentTools: "Tableau / Dataiku",
    playbook: "规模小但案例已验证→推低成本试用：免费试用2个月 + 首单70%补贴（前三单补贴计划）",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
  },
  {
    name: "Data Semantics", category: "POWER_BI", tier: "B", city: "迪拜", country: "UAE",
    headcount: "250+人，13年BI经验", website: "datasemantics.ae",
    capability: "BI 实施，Fortune 500 客户", knownClients: "Emaar AP（-30%周期时间）、Global Auto Giant、油气行业",
    certLevel: "Microsoft Gold BI Partner", currentTools: "Power BI",
    playbook: "250+人大公司→推「批量认证+产研驻场」：免费10人FCA批量认证 + 1个月产研驻场",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 8,
    contacts: [{ name: "Sujith Varghese", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Sujith Varghese Data Semantics" }],
  },
  {
    name: "Logesys Solutions", category: "POWER_BI", tier: "B", city: "迪拜", country: "UAE",
    headcount: "未公开（2000+数据项目）", website: "logesys.com",
    capability: "零售/FMCG 数据项目", knownClients: "Landmark Group（1800门店）、Times Square Group",
    playbook: "零售/FMCG深度→推「帆软FineBI+Logesys零售数据模型」行业联合方案",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
    contacts: [{ name: "Joseph Vijayakumar", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Joseph Vijayakumar Logesys" }],
  },
  {
    name: "Kagool", category: "POWER_BI", tier: "B", city: "迪拜", country: "UAE",
    website: "kagool.com",
    capability: "政府 AI 项目（AI Engine、Citizen Companion）", knownClients: "UAE Federal Government AI Engine、Citizen Companion(Mai)",
    certLevel: "FY24 Microsoft UAE Partner of the Year",
    playbook: "推「政府AI+BI」联合方案：Kagool 做 AI 决策层，帆软 FineBI 做展示层",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
    contacts: [{ name: "Mo Fayez", role: "DECISION_MAKER", title: "MD", contactInfo: "LinkedIn: Mo Fayez Kagool" }],
  },
  {
    name: "Alnafitha", category: "POWER_BI", tier: "B", city: "利雅得", country: "KSA",
    headcount: "未公开（7000+客户）", website: "alnafitha.com",
    capability: "微软全栈服务", knownClients: "United Matbouli Group、Saudi Gulf Airlines、NEOM、7000+客户",
    certLevel: "2025 沙特最佳微软合作伙伴", currentTools: "Power BI",
    playbook: "7000+客户基础→帆软作为增值服务提供：客户不换供应商，伙伴多赚一份钱",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
  },
  {
    name: "Levarus", category: "TABLEAU", tier: "B", city: "迪拜", country: "UAE",
    website: "levarus.com",
    capability: "跨 GCC 八国 Tableau 服务", knownClients: "GCC Tableau 客户（沙特/科威特/巴林/阿曼）",
    currentTools: "Tableau",
    playbook: "八国覆盖→推「GCC区域独家代理」：Tableau 客户加 FineBI，一个合同八个市场",
    aiVerified: "PARTIAL", priority: "P1", fitScore: 7,
  },
  {
    name: "Quant Data & Analytics", category: "PURE_DATA", tier: "B", city: "利雅得", country: "KSA",
    headcount: "154人，$10.6M收入，43% CAGR", website: "quant.sa",
    capability: "数据科学、AI、自有SaaS（Suhail AI分析 / Fruits360 供应链）", knownClients: "Saudi Awwal Bank(SAB)、Satellogic",
    keyDifferentiator: "自有 BI SaaS 产品，可做 OEM",
    playbook: "推「OEM合作」：FineReport 引擎 API 级嵌入 Suhail 平台",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 8,
    contacts: [{ name: "Ahmed Bukhamseen", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Ahmed Bukhamseen Quant" }],
  },
  {
    name: "Bahrain Consulting", category: "PURE_DATA", tier: "B", city: "麦纳麦", country: "Bahrain",
    headcount: "小型", website: "bahrainconsulting.net",
    capability: "纯 BI + 数据科学", knownClients: "Capital Stay、VeloTrack Logistics、Riyadh HealthTech",
    currentTools: "Power BI / Tableau / Metabase 三持",
    keyDifferentiator: "三工具开放态度，认知最先进，学习成本最低",
    playbook: "推「第4个工具」方案：一人两天培训上手 FineBI，多一类客户多一份收入",
    aiVerified: "PARTIAL", priority: "P1", fitScore: 7,
  },
  {
    name: "Gulflytics", category: "PURE_DATA", tier: "B", city: "马斯喀特", country: "Oman",
    headcount: "5-15人", website: "gulflytics.com",
    capability: "阿曼本土纯数据公司", knownClients: "卡塔尔劳工部 LMIS 系统、Ouqoul AI 平台",
    keyDifferentiator: "创始人同时是卡塔尔劳工部数字化转型顾问，跨双市场",
    playbook: "推「阿曼+卡塔尔双市场独家代理」，帆软技术与市场全力支持",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
    contacts: [{ name: "Salim Al-Barami", role: "DECISION_MAKER", title: "创始人", contactInfo: "LinkedIn: Salim Al-Barami Gulflytics" }],
  },
  {
    name: "Accurate Middle East", category: "PURE_DATA", tier: "B", city: "阿布扎比 / 迪拜", country: "UAE",
    headcount: "5-15人，300+项目", website: "accuratemiddleeast.com",
    capability: "市场研究 + AI 驱动 BI", knownClients: "European Leather 品牌、Beverage 公司、投资者、家族办公室",
    keyDifferentiator: "BI+市场研究独特组合，深耕 UAE/KSA 政府市场",
    playbook: "推「数据+洞察」联合方案：市场洞察 + 数据可视化打包，卖能讲故事的数据洞察",
    aiVerified: "VERIFIED", priority: "P1", fitScore: 7,
  },

  // ===== Tier C（后续跟进） =====
  { name: "SquareOne KSA", category: "IT_INTEGRATOR", tier: "C", city: "利雅得", country: "KSA", playbook: "Dr. Muhammad Ali Khan 18年经验→推行业解决方案合作", priority: "P2", aiVerified: "PARTIAL", contacts: [{ name: "Dr. Muhammad Ali Khan", role: "DECISION_MAKER", title: "负责人", }] },
  { name: "Whetstonez", category: "PURE_DATA", tier: "C", city: "吉达", country: "KSA", knownClients: "SNB、GIB、ISDB、SAB 四大银行", playbook: "四大银行客户资源极有价值→推银行BI方案", priority: "P1", aiVerified: "PARTIAL", contacts: [{ name: "Waqar Ali Gill", role: "DECISION_MAKER", title: "CEO", contactInfo: "LinkedIn: Waqar Ali Gill Whetstonez" }] },
  { name: "Daam Al-Arabia", category: "PURE_DATA", tier: "C", city: "吉达", country: "KSA", headcount: "11-20人", capability: "数字分析、Google Analytics、电商", knownClients: "Nahdi Medical、Masdar", playbook: "沙特首家数字分析agency→小而精，推灵活合作", priority: "P3", aiVerified: "VERIFIED" },
  { name: "Constient", category: "TABLEAU", tier: "C", city: "迪拜", country: "UAE", capability: "Tableau + 数据分析", knownClients: "迪拜 Top10 AI 咨询", currentTools: "Tableau", playbook: "低成本试用切入", priority: "P2", aiVerified: "VERIFIED" },
  { name: "IAX Services", category: "POWER_BI", tier: "C", city: "迪拜硅绿洲", country: "UAE", certLevel: "Microsoft Gold + Solutions Partner", capability: "制造、零售行业 BI", playbook: "推 Power BI 互补方案", priority: "P2", aiVerified: "VERIFIED" },
  { name: "Synoptek", category: "POWER_BI", tier: "C", city: "全球（中东交付）", country: "USA / UAE", certLevel: "Microsoft Solutions Partner Data & AI，19项认证，Inner Circle", capability: "物流、制造 BI", playbook: "Microsoft Inner Circle→大型项目合作", priority: "P2", aiVerified: "VERIFIED" },
  { name: "Alphavima", category: "POWER_BI", tier: "C", city: "跨GCC", country: "GCC", certLevel: "Microsoft Partner", playbook: "批量认证培训切入", priority: "P3", aiVerified: "PARTIAL" },
  { name: "ZTABS", category: "IT_INTEGRATOR", tier: "C", city: "多哈（远程）", country: "Qatar", knownClients: "300+客户", playbook: "推卡塔尔独家代理", priority: "P2", aiVerified: "PARTIAL" },
  { name: "Transformation Experts", category: "IT_INTEGRATOR", tier: "C", city: "沙特", country: "KSA", capability: "20年+经验", playbook: "Vision 2030 项目联合", priority: "P3", aiVerified: "PARTIAL" },
  { name: "Watan First Digital", category: "IT_INTEGRATOR", tier: "C", city: "沙特", country: "KSA", headcount: "$10M+收入", playbook: "推大型项目合作", priority: "P2", aiVerified: "PARTIAL" },
  { name: "DoAnalytica", category: "PURE_DATA", tier: "C", city: "吉达", country: "KSA", headcount: "11-50人", capability: "AI + 数据科学，金融科技、医疗", playbook: "推 AI+BI 联合方案", priority: "P2", aiVerified: "VERIFIED" },

  // ===== 候选池其余（来自纯数据/BI伙伴清单 V3，未进作战清单） =====
  { name: "Keyrus", category: "PURE_DATA", city: "迪拜 / 卡萨布兰卡", country: "UAE / Morocco", headcount: "3,300+", capability: "数据咨询、AI、EPM、多工具策略（Tableau+PBI+Snowflake）", knownClients: "Huawei、Saudi Vision 2030", currentTools: "Tableau / Power BI / Snowflake", aiVerified: "VERIFIED", contacts: [{ name: "Mehdi Skik", role: "DECISION_MAKER", title: "MEA MD", }] },
  { name: "D4DS", category: "PURE_DATA", city: "利雅得", country: "KSA", headcount: "21-50人", capability: "数据治理、数字化转型", knownClients: "Orion Governance、沙特政府", aiVerified: "VERIFIED", contacts: [{ name: "Dr. Fawaz Bindelaim", role: "DECISION_MAKER", title: "负责人", }] },
  { name: "Proven Consult", category: "PURE_DATA", city: "利雅得", country: "KSA", headcount: "100-200人", capability: "数据咨询、BI、EPM", knownClients: "沙特企业、政府", aiVerified: "VERIFIED" },
  { name: "UData", category: "PURE_DATA", city: "麦纳麦", country: "Bahrain", headcount: "10-20人", capability: "数据科学，Soothsayer 全球团队", knownClients: "巴林及 MENA 企业", aiVerified: "VERIFIED" },
  { name: "Anova Analysis", category: "PURE_DATA", city: "利雅得", country: "KSA", headcount: "11-50人", capability: "数据分析、媒体监测", knownClients: "媒体客户", aiVerified: "VERIFIED" },
  { name: "Systech", category: "PURE_DATA", city: "利雅得", country: "KSA", capability: "数据科学、BI、AI", knownClients: "多行业", aiVerified: "PARTIAL" },
  { name: "Zero One Solutions", category: "PURE_DATA", city: "多哈", country: "Qatar", headcount: "中型", capability: "数据咨询、AI、ICT", knownClients: "FIFA 2022 LMS、公共部门", aiVerified: "VERIFIED" },
  { name: "ITG", category: "PURE_DATA", city: "安曼", country: "Jordan", headcount: "250-300人", capability: "IT 咨询 + 数据分析（1989年成立）", knownClients: "沙特教育部、GUtech", aiVerified: "VERIFIED" },
  { name: "PioTech", category: "PURE_DATA", city: "安曼", country: "Jordan", headcount: "50-249人", capability: "数据分析、BI 咨询（2003年成立）", knownClients: "多行业", aiVerified: "VERIFIED" },
  { name: "NileBI", category: "PURE_DATA", city: "开罗", country: "Egypt", headcount: "10-49人", capability: "BI 培训 + 咨询（20+年）", knownClients: "金融、零售、医疗", aiVerified: "VERIFIED" },
  { name: "Synapse Analytics", category: "PURE_DATA", city: "开罗", country: "Egypt", headcount: "50+人", capability: "数据科学、AI、BI（2024年9月被收购）", knownClients: "企业 AI 客户", aiVerified: "VERIFIED" },
  { name: "GFB Solutions", category: "PURE_DATA", city: "麦纳麦", country: "Bahrain", capability: "数据分析、BI", certLevel: "Microsoft Partner", aiVerified: "PARTIAL" },
  { name: "Exology", category: "PURE_DATA", city: "新开罗", country: "Egypt", headcount: "11-50人", capability: "Power BI、BI 自动化（200+项目）", currentTools: "Power BI", aiVerified: "VERIFIED" },
  { name: "Intelliero", category: "PURE_DATA", city: "迪拜", country: "UAE", capability: "数据咨询、AI、数字化转型", aiVerified: "PARTIAL" },
  { name: "Muasasat Advanced", category: "PURE_DATA", city: "利雅得", country: "KSA", capability: "数据分析、可视化", aiVerified: "PARTIAL" },
  { name: "Evincible Solutions", category: "POWER_BI", city: "吉达 / 利雅得", country: "KSA", headcount: "200+人", certLevel: "Microsoft Gold Partner（21年）", knownClients: "沙特中小企业", aiVerified: "VERIFIED" },
  { name: "New Era Technology", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Microsoft Solutions Partner（SAP + Microsoft 双生态）", aiVerified: "VERIFIED" },
  { name: "Intwo", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Gold Cloud Business Applications（UAE 首家）", knownClients: "Dynamics 365 客户", aiVerified: "VERIFIED" },
  { name: "Folio3", category: "POWER_BI", city: "美国（中东交付）", country: "USA / UAE", certLevel: "Microsoft Solutions Partner Analytics / Data & AI", knownClients: "100+ Power BI 实施", aiVerified: "VERIFIED" },
  { name: "LTech Pro", category: "POWER_BI", city: "达曼", country: "KSA", certLevel: "Microsoft Gold Partner", knownClients: "Jarir Bookstore、政府部委", aiVerified: "VERIFIED" },
  { name: "Ctelecoms", category: "POWER_BI", city: "沙特", country: "KSA", certLevel: "Microsoft Gold + Solutions Partner", knownClients: "沙特中小企业", aiVerified: "VERIFIED" },
  { name: "mTech", category: "POWER_BI", city: "沙特", country: "KSA", certLevel: "Microsoft Gold Partner", knownClients: "沙特本地客户", aiVerified: "PARTIAL" },
  { name: "PAIS Gulf", category: "POWER_BI", city: "沙特", country: "KSA", certLevel: "Microsoft Solutions Partner", aiVerified: "PARTIAL" },
  { name: "GetOnData", category: "POWER_BI", city: "迪拜", country: "UAE", capability: "Power BI 专精（2022年成立）", currentTools: "Power BI", aiVerified: "VERIFIED" },
  { name: "Maison", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Microsoft Dynamics Gold Partner", aiVerified: "VERIFIED" },
  { name: "Cetas", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Microsoft Solutions Partner（15+年）", knownClients: "财富管理、金融", aiVerified: "VERIFIED" },
  { name: "Neologix", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Microsoft Partner（22+年，ISO 27001）", capability: "SharePoint、Azure AI", aiVerified: "VERIFIED" },
  { name: "HAMT", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Microsoft Partner", aiVerified: "PARTIAL" },
  { name: "SQIT", category: "POWER_BI", city: "迪拜", country: "UAE", certLevel: "Dynamics 365 Partner（2018年成立）", knownClients: "油气、建筑", aiVerified: "VERIFIED" },
  { name: "Swasti Datamatrix", category: "POWER_BI", city: "迪拜", country: "UAE", capability: "Dynamics 365 + Power BI + Salesforce", aiVerified: "VERIFIED" },
  { name: "SIMFOTIX", category: "POWER_BI", city: "迪拜", country: "UAE", capability: "Power BI / Tableau 培训（2014年成立）", aiVerified: "VERIFIED" },
  { name: "Knowledge Academy", category: "POWER_BI", city: "迪拜", country: "UAE", capability: "Power BI / Tableau IT 认证培训", aiVerified: "VERIFIED" },
  { name: "Squillion Tech", category: "TABLEAU", city: "迪拜", country: "UAE", capability: "Tableau + Power BI", currentTools: "Tableau / Power BI", aiVerified: "VERIFIED" },
  { name: "TMC / TallyMarks", category: "QLIK", city: "巴基斯坦 / UAE / KSA", country: "UAE / KSA", certLevel: "Qlik Master Reseller（最高级）", knownClients: "230+全球客户、SAP+Qlik MENA", currentTools: "Qlik / SAP", aiVerified: "VERIFIED" },
  { name: "Finesse Solutions", category: "QLIK", city: "迪拜", country: "UAE", certLevel: "Qlik Elite Partner（最高级）", knownClients: "60+ Qlik 实施、Gulf Air", currentTools: "Qlik", aiVerified: "VERIFIED" },
  { name: "Techcarrot", category: "QLIK", city: "迪拜", country: "UAE", certLevel: "Qlik Partner", capability: "Qlik 分析与集成", currentTools: "Qlik", aiVerified: "VERIFIED" },
];

// 12 周行动时间线 → 初始待办（W1 = 种子导入后的下一周）
const weeklyActions: { week: number; title: string; partner?: string }[] = [
  { week: 1, title: "LinkedIn 联系 Beinex CEO Shantosh Sridhar", partner: "Beinex" },
  { week: 1, title: "LinkedIn 联系 TechMantra CEO Srinivas Singh", partner: "TechMantra" },
  { week: 1, title: "LinkedIn 联系 BEMEA 创始人 Johnny Youssef", partner: "BEMEA" },
  { week: 1, title: "LinkedIn 联系 SEIDOR Marc Haberland", partner: "SEIDOR / Clariba" },
  { week: 2, title: "DAMA Saudi 活动接触 DataPlus 创始人 Mosaab Alharbi", partner: "DataPlus" },
  { week: 2, title: "华为云引荐 KASP（Dr. Magd Donia）", partner: "KASP" },
  { week: 2, title: "华为云引荐 Ejada Systems", partner: "Ejada Systems" },
  { week: 2, title: "联系 Datahub Analytics（Ruba al-Tarawneh）", partner: "Datahub Analytics" },
  { week: 3, title: "技术 Demo：Beinex（含 Arabic RTL 演示）", partner: "Beinex" },
  { week: 3, title: "技术 Demo：TechMantra", partner: "TechMantra" },
  { week: 3, title: "技术 Demo：BEMEA", partner: "BEMEA" },
  { week: 3, title: "技术 Demo：Datahub Analytics", partner: "Datahub Analytics" },
  { week: 4, title: "给 KASP 提供 SAP BO 替代 TCO 计算", partner: "KASP" },
  { week: 4, title: "给 DataPlus 出 Purity IT 联合方案", partner: "DataPlus" },
  { week: 4, title: "启动 Bilytica 合作谈判", partner: "Bilytica" },
  { week: 5, title: "POC 启动：Beinex、TechMantra 各 1 个客户", partner: "Beinex" },
  { week: 5, title: "SEIDOR / Clariba 技术 Demo", partner: "SEIDOR / Clariba" },
  { week: 6, title: "拜访 Future Systems 利雅得办公室", partner: "Future Systems" },
  { week: 6, title: "Ejada 华为云引荐会面", partner: "Ejada Systems" },
  { week: 7, title: "POC 中期复盘（Beinex / TechMantra）" },
  { week: 7, title: "接触 Kagool、Alnafitha", partner: "Kagool" },
  { week: 8, title: "Data Semantics 批量认证培训启动", partner: "Data Semantics" },
  { week: 8, title: "Logesys 零售联合方案研讨", partner: "Logesys Solutions" },
  { week: 9, title: "POC 收尾；首单谈判（Beinex / TechMantra 优先）" },
  { week: 10, title: "目标：签约 2-3 家 Tier A；启动 Tier B 批量接触" },
  { week: 11, title: "Whetstonez（四大银行资源）重点推进", partner: "Whetstonez" },
  { week: 11, title: "Gulflytics 双市场独家代理谈判", partner: "Gulflytics" },
  { week: 12, title: "目标：累计签约 5-8 家；启动首批前三单补贴项目" },
];

// ===== Agent 模板库（幂等：按名称 upsert） =====
const agentTemplates = [
  {
    name: "Sentiment Monitor",
    icon: "📡",
    description:
      "Scan subscribed dimensions on a schedule (news, people, hiring, deals, competitors, risk, etc.) and store results.",
    instructions: `You are a partner sentiment monitoring radar, bound to a single partner. Each run:
1. Call scan_sentiment (partnerName = bound partner). The scan searches by the partner's subscribed monitor dimensions and classifies sentiment (positive/neutral/negative/risk), deduplicates, and stores results.
2. If no dimensions are configured, scan_sentiment returns a hint — explain in the brief that dimensions must be set on the partner page.
3. Output a brief: new item count and sentiment breakdown, notable negative/risk items, impact on Fanruan partnership, and suggested next steps. Say clearly if nothing new was found.`,
    skills: ["get_partner", "scan_sentiment"],
    trigger: "SCHEDULE",
    frequency: "WEEKLY",
    runWeekday: 1,
    runHour: 9,
    scopeType: "PARTNER",
  },
  {
    name: "Stale Partner Revival",
    icon: "⏰",
    description:
      "Daily scan for active partners with no activity in 30+ days; suggest re-engagement and create high-priority todos.",
    instructions: `You are a partner engagement health monitor. Each run:
1. Use search_partners to find status=ACTIVE partners with no activity for 30+ days (staleDaysOver=30).
2. If none, output "All healthy" and stop.
3. For each stale partner, use get_partner and suggest one concrete re-engagement action (who to contact, hook, talking points) based on Tier, pipeline stage, and playbook.
4. For Tier A or pipeline stage >= 4, use create_todo with a high-priority todo (title includes partner name and action).
5. If get_partner shows a WeCom group chatId, use push_wecom to send a short revival summary to that group; if not bound, skip push and note in the brief.
6. Output a brief: stale list by risk + revival suggestions + todos created + WeCom push status.`,
    skills: ["search_partners", "get_partner", "create_todo", "list_todos", "list_wecom_chats", "push_wecom"],
    trigger: "SCHEDULE",
    frequency: "DAILY",
    runHour: 8,
    scopeType: "ALL",
  },
  {
    name: "Prospect Discovery",
    icon: "🔍",
    description: "Manual run: search for new potential partner companies and output a research brief for the pool.",
    instructions: `You are a partner expansion researcher. Each run:
1. Use search_partners to list existing partners and avoid duplicates.
2. Use web_search for BI / data analytics implementers in the Middle East (UAE / KSA focus).
3. For promising companies, web_search for website and case studies (size, stack, certifications).
4. Output a brief per candidate: name, location, stack, clients, fit for Fanruan, suggested outreach.`,
    skills: ["search_partners", "web_search", "linkedin_search"],
    trigger: "MANUAL",
    scopeType: "ALL",
  },
  {
    name: "Pre-meeting Brief",
    icon: "📋",
    description: "Manual (partner-bound): compile profile + latest external updates into a one-page pre-meeting brief.",
    instructions: `You are a meeting prep assistant. Each run, for the bound partner produce a one-page brief:
1. get_partner for full profile (includes WeCom group chatId if bound).
2. list_todos for open items (prior commitments).
3. linkedin_search for key contacts; web_search for recent news (2 weeks).
4. search_knowledge for Fanruan talk tracks / competitive ammo.
5. Structure: one-line status; key people and attitudes; open items; suggested agenda (≤3) and goals; external updates or ammo.
6. create_document (type=MEETING_PREP) when done.
7. If get_partner shows a WeCom group chatId, push_wecom with a concise Markdown summary of the brief; if not bound, skip push and state in the final brief that the partner has no WeCom group bound.`,
    skills: ["get_partner", "list_todos", "linkedin_search", "web_search", "search_knowledge", "create_document", "push_wecom"],
    trigger: "MANUAL",
    scopeType: "PARTNER",
  },
  {
    name: "Joint Solution Report",
    icon: "📝",
    description:
      "Manual (partner-bound): generate an editable joint solution Markdown report from profile and knowledge base.",
    instructions: `You are a joint solution author. Each run for the bound partner:
1. get_partner for full profile.
2. search_knowledge and read_kms for internal Fanruan docs.
3. list_todos for open partner-related items.
4. Markdown report: target customer & pain; joint value prop; scenarios; pricing/co-op model; 90-day plan (3–5 actions).
5. create_document (type=JOINT_SOLUTION) when done.`,
    skills: ["get_partner", "search_knowledge", "read_kms", "list_todos", "create_document"],
    trigger: "MANUAL",
    scopeType: "PARTNER",
  },
];

async function seedBuiltinSkills() {
  const { SKILLS } = await import("../src/lib/skills");
  for (const s of SKILLS) {
    const exists = await db.skill.findFirst({ where: { name: s.name, isBuiltin: true } });
    if (exists) continue;
    await db.skill.create({
      data: {
        name: s.name,
        label: s.label,
        description: s.desc,
        kind: "BUILTIN",
        toolDef: JSON.stringify(s.def),
        isBuiltin: true,
        shared: true,
      },
    });
  }
  console.log("内置 Skill 库就绪");
}

async function seedKnowledgeAndMaterials() {
  const kCount = await db.knowledgeArticle.count();
  if (kCount === 0) {
    await db.knowledgeArticle.createMany({
      data: [
        {
          title: "帆软公司与产品概览",
          slug: "fanruan-overview",
          category: "COMPANY",
          content:
            "帆软（Fanruan）是中国领先的商业智能与数据分析软件厂商，核心产品包括 FineReport（企业级报表）、FineBI（自助分析）、FineDataLink（数据集成）。在中东市场主打：复杂报表+自助分析组合、Arabic RTL 支持、本地化部署、相对 Tableau/Power BI 的性价比与报表深度优势。",
          shared: true,
        },
        {
          title: "中东区伙伴拓展策略",
          slug: "middle-east-strategy",
          category: "STRATEGY",
          content:
            "重点市场：UAE、沙特（KSA）。策略：Tier A 伙伴优先（Tableau/Power BI 系实施商），推「双持/互补」而非替代；政府项目强调 NDMO/合规与本地化；通过 DAMA、华为云、微软生态活动引荐；12 周目标签约 5-8 家伙伴并启动首批补贴项目。",
          shared: true,
        },
        {
          title: "FineBI vs Power BI 话术弹药",
          slug: "finebi-vs-powerbi",
          category: "PLAYBOOK",
          content:
            "Power BI 痛点：1GB 数据集限制、企业级功能涨价、复杂中国式报表弱。帆软切入点：FineReport 填补复杂报表与打印场景；FineBI 覆盖自助分析；联合方案「Power BI 看板 + 帆软报表」降低迁移阻力。",
          shared: true,
        },
      ],
    });
    console.log("知识库种子文章已导入");
  }

  const mCount = await db.material.count();
  if (mCount === 0) {
    await db.material.createMany({
      data: [
        {
          title: "伙伴分级制度（Tier A/B/C）",
          description: "中东区伙伴分级标准与权益",
          category: "TIER_POLICY",
          body: "## Tier A\n立即打，资源优先。\n\n## Tier B\n培育池，季度复盘。\n\n## Tier C\n观察名单。",
          shared: true,
        },
        {
          title: "FineBI vs Power BI 产品对比表",
          description: "销售/BD 用一页对比",
          category: "PRODUCT_COMPARE",
          body: "| 维度 | FineBI | Power BI |\n|------|--------|----------|\n| 复杂报表 | 强 | 弱 |\n| 自助分析 | 强 | 强 |\n| 本地化部署 | 支持 | 有限 |",
          shared: true,
        },
        {
          title: "帆软中东推介 Deck 提纲",
          description: "对外推介 PPT 结构建议",
          category: "DECK",
          body: "1. 帆软是谁\n2. 中东客户案例\n3. 产品矩阵\n4. 伙伴合作模式\n5. 下一步",
          shared: true,
        },
      ],
    });
    console.log("物料中心种子已导入");
  }
}

async function seedAgentTemplates() {
  // 一次性清理：已被「舆情监控」覆盖的旧模板
  await db.agent.deleteMany({
    where: { isTemplate: true, name: { in: ["领英/外部动态监测", "竞品信号雷达", "LinkedIn / External Monitor (deprecated)", "Competitor Signal Radar (deprecated)"] } },
  });
  for (const t of agentTemplates) {
    const exists = await db.agent.findFirst({ where: { name: t.name, isTemplate: true } });
    if (exists) {
      await db.agent.update({
        where: { id: exists.id },
        data: {
          description: t.description,
          instructions: t.instructions,
          skills: JSON.stringify(t.skills),
        },
      });
      continue;
    }
    await db.agent.create({
      data: {
        name: t.name,
        icon: t.icon,
        description: t.description,
        instructions: t.instructions,
        skills: JSON.stringify(t.skills),
        trigger: t.trigger,
        frequency: t.frequency ?? null,
        runHour: t.runHour ?? 9,
        runWeekday: t.runWeekday ?? 1,
        scopeType: t.scopeType,
        shared: true,
        enabled: false,
        isTemplate: true,
      },
    });
  }
  console.log(`Agent 模板库就绪（${agentTemplates.length} 个模板）`);
}

async function main() {
  await seedBuiltinSkills();
  await seedKnowledgeAndMaterials();
  await seedAgentTemplates();

  const count = await db.partner.count();
  if (count > 0) {
    console.log(`数据库已有 ${count} 个伙伴，跳过种子导入（如需重置请删除 prisma/dev.db 后重新 db push + seed）`);
    return;
  }

  for (const p of partners) {
    const { contacts, ...fields } = p;
    const created = await db.partner.create({
      data: {
        ...fields,
        status: "PROSPECT",
        poolFlag: p.tier === "A" ? "ADVANCING" : "NEW",
        contacts: contacts ? { create: contacts } : undefined,
      },
    });
    await db.timelineEvent.create({
      data: {
        partnerId: created.id,
        type: "SYSTEM",
        title: "从材料导入候选池",
        content: `来源：帆软中东BI合作伙伴研究材料（伙伴清单V3 / 作战清单V2）。${p.tier ? `建议分级：Tier ${p.tier}。` : ""}${p.playbook ? `建议打法：${p.playbook}` : ""}`,
      },
    });
  }
  console.log(`已导入 ${partners.length} 个候选伙伴`);

  // 12周行动待办：W1 = 下周一
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  nextMonday.setHours(9, 0, 0, 0);

  let todoCount = 0;
  for (const a of weeklyActions) {
    const due = new Date(nextMonday);
    due.setDate(nextMonday.getDate() + (a.week - 1) * 7 + 4); // 每周五为截止
    const partner = a.partner ? await db.partner.findUnique({ where: { name: a.partner } }) : null;
    await db.todoItem.create({
      data: {
        title: `[W${a.week}] ${a.title}`,
        partnerId: partner?.id,
        dueDate: due,
        priority: a.week <= 4 ? "HIGH" : "MEDIUM",
        source: "SEED",
        detail: "来自 12 周行动时间线（fanru_ops_playbook_v2）",
      },
    });
    todoCount++;
  }
  console.log(`已导入 ${todoCount} 条 12 周行动待办`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
