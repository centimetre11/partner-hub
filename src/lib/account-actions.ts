"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { requireUser } from "./session";

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Display name is required" };
  await db.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated" };
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!current || !next) return { error: "Current and new password are required" };
  if (next.length < 6) return { error: "New password must be at least 6 characters" };
  if (next !== confirm) return { error: "New passwords do not match" };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(current, row.passwordHash))) {
    return { error: "Current password is incorrect" };
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return { ok: true, message: "Password updated" };
}
