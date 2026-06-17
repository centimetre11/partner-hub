export const USER_ROLES = ["SALES", "PRESALES", "ADMIN", "OTHER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SALES: "Sales",
  PRESALES: "Pre-sales",
  ADMIN: "Super Admin",
  OTHER: "Other",
};

export function isSuperAdmin(user: { role?: string | null }): boolean {
  return normalizeUserRole(user.role) === "ADMIN";
}

export function normalizeUserRole(value: string | null | undefined): UserRole {
  const v = String(value ?? "").trim().toUpperCase();
  return USER_ROLES.includes(v as UserRole) ? (v as UserRole) : "OTHER";
}

export function usersByRole<T extends { role?: string | null }>(users: T[], role: UserRole): T[] {
  return users.filter((u) => normalizeUserRole(u.role) === role);
}
