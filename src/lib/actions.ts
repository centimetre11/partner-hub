"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { createSession, destroySession, getCurrentUser, requireUser, requireSuperAdmin } from "./session";
import { stageName } from "./constants";
import { stringifyIndustries } from "./taxonomy";
import { ACTIVE_PARTNER_DEFAULTS } from "./partner-onboarding";
import { normalizeUserRole } from "./user-roles";
import { getLocale } from "./i18n/locale-server";
import { getMessages } from "./i18n/messages";
import { normalizePartnerTier } from "./tier";
import { persistBusinessRecord, normalizeBusinessRecordCategory } from "./business-record-core";
import { normalizeCrmTraceAction, normalizeCrmTraceNature } from "./crm-trace-constants";
import { recordSystemEvent } from "./activity-log";
import { type OwnerRef, ownerPath, ownerWhere, ownerData } from "./owner";
import { END_CUSTOMER_WHERE } from "./customer-filters";

// ============ 认证 ============

export async function loginAction(_: unknown, formData: FormData) {
  const locale = await getLocale();
  const err = getMessages(locale).errors;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: err.emailPasswordRequired };

  const userCount = await db.user.count();
  if (userCount === 0) {
    // 首次使用：第一个登录的人自动成为管理员账号
    const name = String(formData.get("name") ?? "").trim() || email.split("@")[0];
    const user = await db.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10), role: "ADMIN" },
    });
    await createSession(user.id);
    void recordSystemEvent({
      category: "AUTH",
      action: "auth.bootstrap_admin",
      actorId: user.id,
      actorLabel: user.name,
      summary: `首个管理员账号已创建：${user.email}`,
    });
    redirect("/");
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: err.invalidCredentials };
  }
  await createSession(user.id);
  void recordSystemEvent({
    category: "AUTH",
    action: "auth.login",
    actorId: user.id,
    actorLabel: user.name,
    summary: `${user.name} 登录`,
    meta: { email: user.email },
  });
  redirect("/");
}

export async function registerAction(_: unknown, formData: FormData) {
  const admin = await requireSuperAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = normalizeUserRole(String(formData.get("role") ?? ""));
  if (!email || !name || password.length < 6) return { error: "Please fill in all fields; password must be at least 6 characters" };
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return { error: "This email is already registered" };
  await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 10), role } });
  void recordSystemEvent({
    category: "USER",
    action: "user.register",
    actorId: admin.id,
    actorLabel: admin.name,
    targetLabel: name,
    summary: `新成员已注册：${name}（${email}）`,
    meta: { email, role },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUserAction(userId: string, formData: FormData) {
  const admin = await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = normalizeUserRole(String(formData.get("role") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!name || !email) return { error: "Name and email are required" };
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) return { error: "User not found" };
  const emailTaken = await db.user.findFirst({ where: { email, NOT: { id: userId } } });
  if (emailTaken) return { error: "This email is already used by another member" };
  const data: { name: string; email: string; role: string; passwordHash?: string } = { name, email, role };
  if (password.length >= 6) data.passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({ where: { id: userId }, data });
  void recordSystemEvent({
    category: "USER",
    action: "user.update",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "User",
    targetId: userId,
    targetLabel: name,
    summary: `成员资料已更新：${name}`,
    meta: { email, role, passwordChanged: password.length >= 6 },
  });
  revalidatePath("/settings");
  revalidatePath("/partners");
  return { ok: true };
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) {
    void recordSystemEvent({
      category: "AUTH",
      action: "auth.logout",
      actorId: user.id,
      actorLabel: user.name,
      summary: `${user.name} 退出登录`,
    });
  }
  await destroySession();
  redirect("/login");
}

// ============ 伙伴 ============

const EDITABLE_FIELDS = [
  "name", "category", "partnerArchetype", "valuePattern",
  "valuePartnerOffer", "valueFanruanOffer", "valueCustomerOutcome", "dedicatedHeadcount",
  "tier", "city", "country", "headcount", "website", "companyType",
  "coreBusiness", "capability", "knownClients", "certLevel", "currentTools",
  "keyDifferentiator", "playbook", "pitch", "bestChannel", "notes",
] as const;

function readPartnerField(formData: FormData, field: (typeof EDITABLE_FIELDS)[number]): unknown {
  if (!formData.has(field)) return undefined;
  const v = String(formData.get(field) ?? "").trim();
  if (field === "tier") return v ? normalizePartnerTier(v) : null;
  return v || null;
}

export async function updatePartnerAction(partnerId: string, formData: FormData) {
  await requireUser();
  const data: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    const value = readPartnerField(formData, f);
    if (value !== undefined) data[f] = value;
  }
  if (formData.has("ownerId")) {
    const v = String(formData.get("ownerId"));
    data.ownerId = v || null;
    data.salesUserId = v || null;
  }
  if (formData.has("salesUserId")) {
    const v = String(formData.get("salesUserId"));
    data.salesUserId = v || null;
    data.ownerId = v || null;
  }
  if (formData.has("presalesUserId")) {
    const v = String(formData.get("presalesUserId"));
    data.presalesUserId = v || null;
  }
  if (formData.has("manualChecked")) {
    data.manualChecked = formData.get("manualChecked") === "on";
  }
  if (formData.has("industries")) {
    const codes = formData.getAll("industries").map(String).filter(Boolean);
    data.industries = stringifyIndustries(codes);
  }
  if (!data.name) delete data.name;
  await db.partner.update({ where: { id: partnerId }, data });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/pool");
}

export async function createPartnerAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  // intent=active：从「正式伙伴」页直建，跳过候选直接进入正式经营
  const asActive = String(formData.get("intent") ?? "") === "active";
  const industryCodes = formData.getAll("industries").map(String).filter(Boolean);
  const partner = await db.partner.create({
    data: {
      name,
      category: String(formData.get("category") ?? "OTHER"),
      industries: stringifyIndustries(industryCodes),
      city: String(formData.get("city") ?? "") || null,
      country: String(formData.get("country") ?? "") || null,
      coreBusiness: String(formData.get("coreBusiness") ?? "") || null,
      ...(asActive
        ? { ...ACTIVE_PARTNER_DEFAULTS, promotedAt: new Date() }
        : { status: "PROSPECT", poolFlag: "NEW" }),
    },
  });
  if (asActive) {
    await db.timelineEvent.create({
      data: {
        partnerId: partner.id,
        type: "SYSTEM",
        title: "New active partner",
        content: `${partner.name} was created directly as an active partner, entering the "${stageName(partner.pipelineStage)}" stage.`,
        createdById: user.id,
      },
    });
  } else {
    await db.timelineEvent.create({
      data: { partnerId: partner.id, type: "SYSTEM", title: "Manually added prospect" },
    });
  }
  void recordSystemEvent({
    category: "PARTNER",
    action: "partner.create",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Partner",
    targetId: partner.id,
    targetLabel: partner.name,
    summary: asActive ? `新建正式伙伴：${partner.name}` : `新建候选伙伴：${partner.name}`,
    meta: { status: partner.status },
  });
  revalidatePath("/pool");
  revalidatePath("/partners");
  redirect(`/partners/${partner.id}`);
}

export async function setPoolFlagAction(partnerId: string, flag: string) {
  await requireUser();
  await db.partner.update({ where: { id: partnerId }, data: { poolFlag: flag } });
  revalidatePath("/pool");
  revalidatePath(`/partners/${partnerId}`);
}

export async function promotePartnerAction(partnerId: string) {
  const user = await requireUser();
  const p = await db.partner.update({
    where: { id: partnerId },
    data: { status: "ACTIVE", promotedAt: new Date(), poolFlag: "ADVANCING", pipelineStage: 2, ownerId: undefined },
  });
  await db.timelineEvent.create({
    data: {
      partnerId,
      type: "SYSTEM",
      title: "Promoted to active partner",
      content: `${p.name} moved from prospect pool to active partner management, entering the "${stageName(p.pipelineStage)}" stage.`,
      createdById: user.id,
    },
  });
  revalidatePath("/pool");
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function archivePartnerAction(partnerId: string) {
  const user = await requireUser();
  const p = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  if (p.status === "ARCHIVED") return;
  await db.partner.update({
    where: { id: partnerId },
    data: { status: "ARCHIVED", prevStatus: p.status, poolFlag: "DROPPED" },
  });
  await db.timelineEvent.create({
    data: { partnerId, type: "SYSTEM", title: "Archived", content: `Previous status: ${p.status}`, createdById: user.id },
  });
  revalidatePath("/pool");
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function restorePartnerAction(partnerId: string) {
  const user = await requireUser();
  const p = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  if (p.status !== "ARCHIVED") return;
  const target = p.prevStatus === "ACTIVE" ? "ACTIVE" : "PROSPECT";
  await db.partner.update({
    where: { id: partnerId },
    data: {
      status: target,
      prevStatus: null,
      poolFlag: target === "PROSPECT" ? "NEW" : p.poolFlag,
    },
  });
  await db.timelineEvent.create({
    data: { partnerId, type: "SYSTEM", title: "Restored from archive", content: `Restored to: ${target === "ACTIVE" ? "active partner" : "prospect"}`, createdById: user.id },
  });
  revalidatePath("/pool");
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
}

export async function deletePartnerAction(partnerId: string) {
  await requireUser();
  await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  await db.notification.deleteMany({ where: { partnerId } });
  await db.partner.delete({ where: { id: partnerId } });
  revalidatePath("/pool");
  revalidatePath("/partners");
}

export async function setPipelineStageAction(partnerId: string, stage: number) {
  const user = await requireUser();
  const p = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  if (p.pipelineStage === stage) return;
  await db.partner.update({ where: { id: partnerId }, data: { pipelineStage: stage } });
  await db.timelineEvent.create({
    data: {
      partnerId,
      type: "CHANGE",
      title: `Pipeline：${stageName(p.pipelineStage)} → ${stageName(stage)}`,
      createdById: user.id,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
}

// ============ 联系人 ============

export async function upsertContactAction(owner: OwnerRef, formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "INFLUENCER"),
    title: String(formData.get("title") ?? "") || null,
    department: String(formData.get("department") ?? "") || null,
    attitude: parseInt(String(formData.get("attitude") ?? "0"), 10) || 0,
    reportsToId: String(formData.get("reportsToId") ?? "") || null,
    contactInfo: String(formData.get("contactInfo") ?? "") || null,
    approach: String(formData.get("approach") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  };
  if (!data.name) return;
  if (id) await db.contact.update({ where: { id }, data });
  else await db.contact.create({ data: { ...data, ...ownerData(owner) } });
  revalidatePath(ownerPath(owner));
}

export async function deleteContactAction(owner: OwnerRef, contactId: string) {
  await requireUser();
  await db.contact.delete({ where: { id: contactId } });
  revalidatePath(ownerPath(owner));
}

// ============ 权力地图：拖拽 / 汇报关系 / 布局 ============

// 防环：若把 subId 的上级设为 supId，沿实线（reportsToId + SOLID 附加线）向上遍历，
// 若能从 supId 回到 subId，则说明会成环，应拒绝。
async function wouldCreateCycle(owner: OwnerRef, subId: string, supId: string): Promise<boolean> {
  if (subId === supId) return true;
  const contacts = await db.contact.findMany({
    where: ownerWhere(owner),
    select: { id: true, reportsToId: true },
  });
  const solidLinks = await db.contactLink.findMany({
    where: { ...ownerWhere(owner), kind: "SOLID" },
    select: { subordinateId: true, superiorId: true },
  });
  // 邻接表：下级 -> 所有上级
  const parents = new Map<string, string[]>();
  for (const c of contacts) {
    if (c.reportsToId) parents.set(c.id, [...(parents.get(c.id) ?? []), c.reportsToId]);
  }
  for (const l of solidLinks) {
    parents.set(l.subordinateId, [...(parents.get(l.subordinateId) ?? []), l.superiorId]);
  }
  // 从 supId 出发向上找，看是否能到达 subId
  const stack = [supId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === subId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of parents.get(cur) ?? []) stack.push(p);
  }
  return false;
}

export async function moveContactAction(owner: OwnerRef, contactId: string, x: number, y: number) {
  await requireUser();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  await db.contact.update({ where: { id: contactId }, data: { x, y } });
  revalidatePath(ownerPath(owner));
}

export async function setReportsToAction(
  owner: OwnerRef,
  subId: string,
  superiorId: string | null,
) {
  await requireUser();
  if (!subId) return;
  if (superiorId) {
    if (subId === superiorId) return;
    if (await wouldCreateCycle(owner, subId, superiorId)) return;
  }
  await db.contact.update({ where: { id: subId }, data: { reportsToId: superiorId } });
  revalidatePath(ownerPath(owner));
}

export async function addContactLinkAction(
  owner: OwnerRef,
  subId: string,
  supId: string,
  kind: string,
) {
  await requireUser();
  if (!subId || !supId || subId === supId) return;
  const linkKind = kind === "SOLID" ? "SOLID" : "DOTTED";
  // 仅实线参与防环约束；虚线允许跨级跨部门
  if (linkKind === "SOLID" && (await wouldCreateCycle(owner, subId, supId))) return;
  await db.contactLink.upsert({
    where: { subordinateId_superiorId: { subordinateId: subId, superiorId: supId } },
    update: { kind: linkKind },
    create: { ...ownerData(owner), subordinateId: subId, superiorId: supId, kind: linkKind },
  });
  revalidatePath(ownerPath(owner));
}

export async function removeContactLinkAction(owner: OwnerRef, linkId: string) {
  await requireUser();
  await db.contactLink.delete({ where: { id: linkId } });
  revalidatePath(ownerPath(owner));
}

// 按（下级, 上级）删除附加线，用于撤销「新增虚线」（此时拿不到 linkId）
export async function removeContactLinkBetweenAction(
  owner: OwnerRef,
  subId: string,
  supId: string,
) {
  await requireUser();
  await db.contactLink.deleteMany({
    where: { ...ownerWhere(owner), subordinateId: subId, superiorId: supId },
  });
  revalidatePath(ownerPath(owner));
}

export async function resetPowerMapLayoutAction(owner: OwnerRef) {
  await requireUser();
  await db.contact.updateMany({ where: ownerWhere(owner), data: { x: null, y: null } });
  revalidatePath(ownerPath(owner));
}

// ============ 商机 ============

export async function upsertOpportunityAction(owner: OwnerRef, formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const followUp = String(formData.get("followUpAt") ?? "");
  const data: Record<string, unknown> = {
    name: String(formData.get("name") ?? "").trim(),
    client: String(formData.get("client") ?? "") || null,
    amount: String(formData.get("amount") ?? "") || null,
    stage: String(formData.get("stage") ?? "Needs Assessment"),
    nextStep: String(formData.get("nextStep") ?? "") || null,
    followUpAt: followUp ? new Date(followUp) : null,
    status: String(formData.get("status") ?? "ACTIVE"),
    notes: String(formData.get("notes") ?? "") || null,
  };
  if (formData.has("dealType")) {
    const dt = String(formData.get("dealType") ?? "").trim();
    data.dealType = dt === "PROJECT" || dt === "PRODUCT" ? dt : null;
  }
  if (!data.name) return;
  // 商机以客户为主体，伙伴为可选关联（带单/交付方）；反之亦然
  const crossPartnerId = formData.has("partnerId") ? String(formData.get("partnerId") ?? "").trim() || null : undefined;
  const crossCustomerId = formData.has("customerId") ? String(formData.get("customerId") ?? "").trim() || null : undefined;
  if (id) {
    if (crossPartnerId !== undefined) data.partnerId = crossPartnerId;
    if (crossCustomerId !== undefined) data.customerId = crossCustomerId;
    const opp = await db.opportunity.update({ where: { id }, data });
    if (opp.partnerId) revalidatePath(`/partners/${opp.partnerId}`);
    if (opp.customerId) revalidatePath(`/customers/${opp.customerId}`);
  } else {
    const createData = { ...data, ...ownerData(owner) } as Record<string, unknown>;
    if (owner.kind === "customer" && crossPartnerId !== undefined) createData.partnerId = crossPartnerId;
    if (owner.kind === "partner" && crossCustomerId !== undefined) createData.customerId = crossCustomerId;
    await db.opportunity.create({ data: createData as never });
  }
  revalidatePath(ownerPath(owner));
}

export async function deleteOpportunityAction(owner: OwnerRef, oppId: string) {
  await requireUser();
  await db.opportunity.delete({ where: { id: oppId } });
  revalidatePath(ownerPath(owner));
}

// ============ 合作项目 ============

const PROJECT_PHASES = ["KICKOFF", "IMPLEMENT", "ACCEPTANCE", "GOLIVE", "MAINTENANCE"] as const;
const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "DONE", "CLOSED"] as const;

export async function upsertProjectAction(owner: OwnerRef, formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const phase = String(formData.get("phase") ?? "KICKOFF");
  const status = String(formData.get("status") ?? "ACTIVE");
  const start = String(formData.get("startDate") ?? "");
  const end = String(formData.get("endDate") ?? "");
  const data: Record<string, unknown> = {
    name: String(formData.get("name") ?? "").trim(),
    amount: String(formData.get("amount") ?? "") || null,
    phase: (PROJECT_PHASES as readonly string[]).includes(phase) ? phase : "KICKOFF",
    status: (PROJECT_STATUSES as readonly string[]).includes(status) ? status : "ACTIVE",
    startDate: start ? new Date(start) : null,
    endDate: end ? new Date(end) : null,
    notes: String(formData.get("notes") ?? "") || null,
  };
  if (!data.name) return;
  // 项目以客户为主体，伙伴为可选交付方
  const crossPartnerId = formData.has("partnerId")
    ? String(formData.get("partnerId") ?? "").trim() || null
    : undefined;
  if (id) {
    if (crossPartnerId !== undefined) data.partnerId = crossPartnerId;
    const proj = await db.project.update({ where: { id }, data });
    if (proj.partnerId) revalidatePath(`/partners/${proj.partnerId}`);
    revalidatePath(`/customers/${proj.customerId}`);
  } else {
    // 项目必须挂在客户下
    const customerId = owner.kind === "customer" ? owner.id : String(formData.get("customerId") ?? "").trim();
    if (!customerId) return;
    const createData: Record<string, unknown> = { ...data, customerId };
    if (crossPartnerId !== undefined) createData.partnerId = crossPartnerId;
    else if (owner.kind === "partner") createData.partnerId = owner.id;
    await db.project.create({ data: createData as never });
  }
  revalidatePath(ownerPath(owner));
}

export async function deleteProjectAction(owner: OwnerRef, projectId: string) {
  await requireUser();
  await db.project.delete({ where: { id: projectId } });
  revalidatePath(ownerPath(owner));
}

// 机会赢单后一键转化为合作项目（幂等：已转化则直接复用）
export async function convertOpportunityToProjectAction(owner: OwnerRef, oppId: string) {
  await requireUser();
  const opp = await db.opportunity.findUnique({ where: { id: oppId } });
  if (!opp || !opp.customerId) return;
  // 纯产品型成交不含交付项目，不允许转项目
  if (opp.dealType === "PRODUCT") return;
  const existing = await db.project.findUnique({ where: { sourceOpportunityId: oppId } });
  if (!existing) {
    await db.project.create({
      data: {
        customerId: opp.customerId,
        partnerId: opp.partnerId ?? null,
        name: opp.name,
        amount: opp.amount ?? null,
        sourceOpportunityId: oppId,
        phase: "KICKOFF",
        status: "ACTIVE",
      },
    });
  }
  // 转化即视为赢单且为项目型成交
  if (opp.status !== "WON" || opp.dealType !== "PROJECT") {
    await db.opportunity.update({ where: { id: oppId }, data: { status: "WON", dealType: "PROJECT" } });
  }
  if (opp.partnerId) revalidatePath(`/partners/${opp.partnerId}`);
  revalidatePath(`/customers/${opp.customerId}`);
  revalidatePath(ownerPath(owner));
}

// ============ 待办 ============

export async function createTodoAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const due = String(formData.get("dueDate") ?? "");
  let partnerId = String(formData.get("partnerId") ?? "") || null;
  let customerId = String(formData.get("customerId") ?? "") || null;
  let opportunityId = String(formData.get("opportunityId") ?? "") || null;
  let projectId = String(formData.get("projectId") ?? "") || null;
  // 组合关联字段（来自主待办表单的下拉）：opp:<id> / proj:<id>
  const link = String(formData.get("link") ?? "");
  if (link.startsWith("opp:")) opportunityId = link.slice(4) || null;
  else if (link.startsWith("proj:")) projectId = link.slice(5) || null;
  // 挂到机会/项目时回填其所属客户/伙伴，便于客户层与伙伴层汇总
  if (projectId && !customerId) {
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { customerId: true, partnerId: true } });
    if (proj) {
      customerId = customerId ?? proj.customerId;
      partnerId = partnerId ?? proj.partnerId;
    }
  } else if (opportunityId && !customerId && !partnerId) {
    const opp = await db.opportunity.findUnique({ where: { id: opportunityId }, select: { customerId: true, partnerId: true } });
    if (opp) {
      customerId = opp.customerId;
      partnerId = opp.partnerId;
    }
  }
  await db.todoItem.create({
    data: {
      title,
      detail: String(formData.get("detail") ?? "") || null,
      partnerId,
      customerId,
      opportunityId,
      projectId,
      assigneeId: String(formData.get("assigneeId") ?? "") || user.id,
      dueDate: due ? new Date(due) : null,
      priority: String(formData.get("priority") ?? "MEDIUM"),
    },
  });
  revalidatePath("/todos");
  revalidatePath("/");
  revalidatePath("/mobile");
  if (partnerId) revalidatePath(`/partners/${partnerId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function toggleTodoAction(todoId: string) {
  await requireUser();
  const t = await db.todoItem.findUniqueOrThrow({ where: { id: todoId } });
  const done = t.status !== "DONE";
  await db.todoItem.update({
    where: { id: todoId },
    data: { status: done ? "DONE" : "OPEN", doneAt: done ? new Date() : null },
  });
  revalidatePath("/todos");
  revalidatePath("/");
  if (t.partnerId) revalidatePath(`/partners/${t.partnerId}`);
  if (t.customerId) revalidatePath(`/customers/${t.customerId}`);
}

export async function completeTodoWithNoteAction(formData: FormData) {
  const user = await requireUser();
  const todoId = String(formData.get("todoId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!todoId || !note) return { ok: false as const, error: "note_required" };

  const sync = formData.get("syncToBusinessRecord") === "true";
  const category = normalizeBusinessRecordCategory(String(formData.get("category") ?? "OTHER"));
  const traceNature = String(formData.get("traceNature") ?? "").trim() || null;
  const traceAction = String(formData.get("traceAction") ?? "").trim() || null;
  const contactName = String(formData.get("contactName") ?? "").trim();

  const t = await db.todoItem.findUniqueOrThrow({ where: { id: todoId } });
  if (t.status === "DONE") return { ok: true as const };

  const owner: OwnerRef | null = t.customerId
    ? { kind: "customer", id: t.customerId }
    : t.partnerId
      ? { kind: "partner", id: t.partnerId }
      : null;

  let crmFeedback: { message?: string; warning?: string; info?: string } = {};

  if (sync && owner) {
    if (!normalizeCrmTraceNature(traceNature) || !normalizeCrmTraceAction(traceAction)) {
      return { ok: false as const, error: "crm_fields_required" };
    }
    const content = contactName ? `【联系人 ${contactName}】\n${note}` : note;
    const { crmSync } = await persistBusinessRecord({
      owner,
      userId: user.id,
      category,
      title: t.title,
      content,
      occurredAt: new Date(),
      contactId: null,
      source: "TODO",
      sourceTodoId: todoId,
      traceNature,
      traceAction,
    });
    if (crmSync.status === "synced") {
      crmFeedback = { message: `已同步到 CRM（${crmSync.traceId.slice(0, 8)}…）` };
    } else if (crmSync.status === "failed") {
      crmFeedback = { warning: `本地已保存，CRM 同步失败：${crmSync.error}` };
    } else {
      crmFeedback = { info: `本地已保存（CRM：${crmSync.reason}）` };
    }
  } else {
    const completionNote = `[完成备注 ${new Date().toISOString().slice(0, 10)}] ${note}`;
    await db.todoItem.update({
      where: { id: todoId },
      data: {
        status: "DONE",
        doneAt: new Date(),
        detail: t.detail ? `${t.detail}\n\n${completionNote}` : completionNote,
      },
    });
  }

  revalidatePath("/todos");
  revalidatePath("/");
  if (t.partnerId) revalidatePath(`/partners/${t.partnerId}`);
  if (t.customerId) revalidatePath(`/customers/${t.customerId}`);

  return { ok: true as const, ...crmFeedback };
}

export async function deleteTodoAction(todoId: string) {
  await requireUser();
  const t = await db.todoItem.delete({ where: { id: todoId } });
  revalidatePath("/todos");
  revalidatePath("/");
  if (t.partnerId) revalidatePath(`/partners/${t.partnerId}`);
  if (t.customerId) revalidatePath(`/customers/${t.customerId}`);
}

export async function updateTodoAction(todoId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await db.todoItem.findUniqueOrThrow({ where: { id: todoId } });
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const due = String(formData.get("dueDate") ?? "");
  const hasPartnerField = formData.has("partnerId");
  const hasCustomerField = formData.has("customerId");
  const t = await db.todoItem.update({
    where: { id: todoId },
    data: {
      title,
      detail: String(formData.get("detail") ?? "") || null,
      ...(hasPartnerField ? { partnerId: String(formData.get("partnerId") ?? "") || null } : {}),
      ...(hasCustomerField ? { customerId: String(formData.get("customerId") ?? "") || null } : {}),
      assigneeId: String(formData.get("assigneeId") ?? "") || user.id,
      dueDate: due ? new Date(due) : null,
      ...(formData.has("priority")
        ? { priority: String(formData.get("priority") ?? "MEDIUM") }
        : {}),
    },
  });
  revalidatePath("/todos");
  revalidatePath("/");
  if (t.partnerId) revalidatePath(`/partners/${t.partnerId}`);
  if (t.customerId) revalidatePath(`/customers/${t.customerId}`);
  if (existing.partnerId && existing.partnerId !== t.partnerId) {
    revalidatePath(`/partners/${existing.partnerId}`);
  }
  if (existing.customerId && existing.customerId !== t.customerId) {
    revalidatePath(`/customers/${existing.customerId}`);
  }
}

// ============ 培训 ============

export async function upsertTrainingAction(
  owner: { partnerId: string } | { customerId: string },
  formData: FormData,
) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const deadline = String(formData.get("deadline") ?? "");
  const data = {
    person: String(formData.get("person") ?? "").trim(),
    currentSkill: String(formData.get("currentSkill") ?? "") || null,
    targetCert: String(formData.get("targetCert") ?? "") || null,
    method: String(formData.get("method") ?? "") || null,
    deadline: deadline ? new Date(deadline) : null,
    status: String(formData.get("status") ?? "PLANNED"),
  };
  if (!data.person) return;
  const scope = "partnerId" in owner ? { partnerId: owner.partnerId } : { customerId: owner.customerId };
  if (id) await db.training.update({ where: { id }, data });
  else await db.training.create({ data: { ...data, ...scope } });
  if ("partnerId" in owner) revalidatePath(`/partners/${owner.partnerId}`);
  else revalidatePath(`/customers/${owner.customerId}`);
}

export async function deleteTrainingAction(
  owner: { partnerId: string } | { customerId: string },
  trainingId: string,
) {
  await requireUser();
  await db.training.delete({ where: { id: trainingId } });
  if ("partnerId" in owner) revalidatePath(`/partners/${owner.partnerId}`);
  else revalidatePath(`/customers/${owner.customerId}`);
}

// ============ 时间线 ============

export async function addNoteAction(owner: OwnerRef, formData: FormData) {
  const user = await requireUser();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await db.timelineEvent.create({
    data: {
      ...ownerData(owner),
      type: String(formData.get("type") ?? "NOTE"),
      title: String(formData.get("title") ?? "").trim() || content.slice(0, 40),
      content,
      createdById: user.id,
    },
  });
  revalidatePath(ownerPath(owner));
}

// ============ 帆软集成配置 ============

export async function updatePartnerIntegrationsAction(partnerId: string, formData: FormData) {
  await requireUser();
  const kmsRootPath = String(formData.get("kmsRootPath") ?? "").trim() || null;
  const crmCustomerId = String(formData.get("crmCustomerId") ?? "").trim() || null;
  await db.partner.update({
    where: { id: partnerId },
    data: { kmsRootPath, crmCustomerId },
  });
  await db.customer.updateMany({
    where: { partnerRelation: "SELF", partnerLinks: { some: { partnerId } } },
    data: { kmsRootPath, crmCustomerId },
  });
  revalidatePath(`/partners/${partnerId}`);
}

// ============ 商务记录 ============

export async function createBusinessRecordAction(owner: OwnerRef, formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const traceNature = String(formData.get("traceNature") ?? "").trim() || null;
  const traceAction = String(formData.get("traceAction") ?? "").trim() || null;
  const contactName = String(formData.get("contactName") ?? "").trim();
  if (!normalizeCrmTraceNature(traceNature) || !normalizeCrmTraceAction(traceAction)) {
    return { ok: false as const, error: "crm_fields_required" as const };
  }

  const category = normalizeBusinessRecordCategory(String(formData.get("category") ?? "OTHER"));
  const rawContent = String(formData.get("content") ?? "").trim();
  const content = contactName
    ? rawContent
      ? `【联系人 ${contactName}】\n${rawContent}`
      : `【联系人 ${contactName}】`
    : rawContent || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  const contactId = String(formData.get("contactId") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "MANUAL");
  const sourceTodoId = String(formData.get("sourceTodoId") ?? "").trim() || null;

  const { crmSync } = await persistBusinessRecord({
    owner,
    userId: user.id,
    category,
    title,
    content,
    occurredAt,
    contactId,
    source,
    sourceTodoId,
    traceNature,
    traceAction,
  });

  revalidatePath(ownerPath(owner));
  revalidatePath("/todos");
  revalidatePath("/");
  revalidatePath("/mobile");

  if (crmSync.status === "synced") {
    return { ok: true, message: `已同步到 CRM（${crmSync.traceId.slice(0, 8)}…）` };
  }
  if (crmSync.status === "failed") {
    return { ok: true, warning: `本地已保存，CRM 同步失败：${crmSync.error}` };
  }
  return { ok: true, info: `本地已保存（CRM：${crmSync.reason}）` };
}

export async function deleteBusinessRecordAction(owner: OwnerRef, recordId: string) {
  await requireUser();
  const record = await db.businessRecord.findUnique({
    where: { id: recordId },
    select: { partnerId: true, customerId: true, timelineEventId: true },
  });
  if (!record) return;
  const ownerId = owner.kind === "customer" ? record.customerId : record.partnerId;
  if (ownerId !== owner.id) return;

  await db.businessRecord.delete({ where: { id: recordId } });
  if (record.timelineEventId) {
    await db.timelineEvent.delete({ where: { id: record.timelineEventId } }).catch(() => {});
  }

  revalidatePath(ownerPath(owner));
  revalidatePath("/");
}
