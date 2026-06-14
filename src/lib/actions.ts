"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { createSession, destroySession, requireUser } from "./session";
import { stageName } from "./constants";

// ============ 认证 ============

export async function loginAction(_: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "请输入邮箱和密码" };

  const userCount = await db.user.count();
  if (userCount === 0) {
    // 首次使用：第一个登录的人自动成为管理员账号
    const name = String(formData.get("name") ?? "").trim() || email.split("@")[0];
    const user = await db.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10) },
    });
    await createSession(user.id);
    redirect("/");
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "邮箱或密码错误" };
  }
  await createSession(user.id);
  redirect("/");
}

export async function registerAction(_: unknown, formData: FormData) {
  await requireUser(); // 仅已登录用户可添加成员
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 6) return { error: "请填写完整信息，密码至少6位" };
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return { error: "该邮箱已注册" };
  await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ============ 伙伴 ============

const EDITABLE_FIELDS = [
  "name", "category", "tier", "city", "country", "headcount", "website", "companyType",
  "coreBusiness", "capability", "knownClients", "certLevel", "currentTools",
  "keyDifferentiator", "playbook", "pitch", "bestChannel", "priority", "notes",
] as const;

export async function updatePartnerAction(partnerId: string, formData: FormData) {
  await requireUser();
  const data: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (formData.has(f)) {
      const v = String(formData.get(f) ?? "").trim();
      data[f] = v || null;
    }
  }
  if (formData.has("fitScore")) {
    const n = parseInt(String(formData.get("fitScore")), 10);
    data.fitScore = Number.isNaN(n) ? null : n;
  }
  if (formData.has("ownerId")) {
    const v = String(formData.get("ownerId"));
    data.ownerId = v || null;
  }
  if (formData.has("manualChecked")) {
    data.manualChecked = formData.get("manualChecked") === "on";
  }
  if (!data.name) delete data.name;
  await db.partner.update({ where: { id: partnerId }, data });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/pool");
}

export async function createPartnerAction(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const partner = await db.partner.create({
    data: {
      name,
      category: String(formData.get("category") ?? "OTHER"),
      city: String(formData.get("city") ?? "") || null,
      country: String(formData.get("country") ?? "") || null,
      coreBusiness: String(formData.get("coreBusiness") ?? "") || null,
      status: "PROSPECT",
      poolFlag: "NEW",
    },
  });
  await db.timelineEvent.create({
    data: { partnerId: partner.id, type: "SYSTEM", title: "手动添加候选" },
  });
  revalidatePath("/pool");
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
      title: "转为正式伙伴",
      content: `${p.name} 由候选池转入正式伙伴管理，进入「${stageName(p.pipelineStage)}」阶段。`,
      createdById: user.id,
    },
  });
  // 转正自动生成起步待办
  const starterTodos = [
    { title: `完善 ${p.name} 的权力地图（决策者/把关人/商务）`, days: 7 },
    { title: `确认 ${p.name} 的联合解决方案与切入点`, days: 10 },
    { title: `安排 ${p.name} 技术 Demo（含 Arabic RTL）`, days: 14 },
  ];
  for (const t of starterTodos) {
    const due = new Date();
    due.setDate(due.getDate() + t.days);
    await db.todoItem.create({
      data: { title: t.title, partnerId, assigneeId: user.id, dueDate: due, priority: "HIGH", source: "SEED" },
    });
  }
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
    data: { partnerId, type: "SYSTEM", title: "归档", content: `归档前状态：${p.status}`, createdById: user.id },
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
    data: { partnerId, type: "SYSTEM", title: "恢复归档", content: `恢复为：${target === "ACTIVE" ? "正式伙伴" : "候选"}`, createdById: user.id },
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

export async function upsertContactAction(partnerId: string, formData: FormData) {
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
  else await db.contact.create({ data: { ...data, partnerId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteContactAction(partnerId: string, contactId: string) {
  await requireUser();
  await db.contact.delete({ where: { id: contactId } });
  revalidatePath(`/partners/${partnerId}`);
}

// ============ 商机 ============

export async function upsertOpportunityAction(partnerId: string, formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const followUp = String(formData.get("followUpAt") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    client: String(formData.get("client") ?? "") || null,
    amount: String(formData.get("amount") ?? "") || null,
    stage: String(formData.get("stage") ?? "需求诊断"),
    nextStep: String(formData.get("nextStep") ?? "") || null,
    followUpAt: followUp ? new Date(followUp) : null,
    status: String(formData.get("status") ?? "ACTIVE"),
    notes: String(formData.get("notes") ?? "") || null,
  };
  if (!data.name) return;
  if (id) await db.opportunity.update({ where: { id }, data });
  else await db.opportunity.create({ data: { ...data, partnerId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteOpportunityAction(partnerId: string, oppId: string) {
  await requireUser();
  await db.opportunity.delete({ where: { id: oppId } });
  revalidatePath(`/partners/${partnerId}`);
}

// ============ 待办 ============

export async function createTodoAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const due = String(formData.get("dueDate") ?? "");
  await db.todoItem.create({
    data: {
      title,
      detail: String(formData.get("detail") ?? "") || null,
      partnerId: String(formData.get("partnerId") ?? "") || null,
      assigneeId: String(formData.get("assigneeId") ?? "") || user.id,
      dueDate: due ? new Date(due) : null,
      priority: String(formData.get("priority") ?? "MEDIUM"),
    },
  });
  revalidatePath("/todos");
  revalidatePath("/");
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
}

export async function deleteTodoAction(todoId: string) {
  await requireUser();
  const t = await db.todoItem.delete({ where: { id: todoId } });
  revalidatePath("/todos");
  revalidatePath("/");
  if (t.partnerId) revalidatePath(`/partners/${t.partnerId}`);
}

// ============ 培训 ============

export async function upsertTrainingAction(partnerId: string, formData: FormData) {
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
  if (id) await db.training.update({ where: { id }, data });
  else await db.training.create({ data: { ...data, partnerId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteTrainingAction(partnerId: string, trainingId: string) {
  await requireUser();
  await db.training.delete({ where: { id: trainingId } });
  revalidatePath(`/partners/${partnerId}`);
}

// ============ 时间线 ============

export async function addNoteAction(partnerId: string, formData: FormData) {
  const user = await requireUser();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await db.timelineEvent.create({
    data: {
      partnerId,
      type: String(formData.get("type") ?? "NOTE"),
      title: String(formData.get("title") ?? "").trim() || content.slice(0, 40),
      content,
      createdById: user.id,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
}
