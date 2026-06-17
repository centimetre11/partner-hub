"use client";

import type { User } from "@prisma/client";
import { USER_ROLES, USER_ROLE_LABELS } from "@/lib/user-roles";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function PartnerTeamFields({
  users,
  salesUserId,
  presalesUserId,
  className = input,
}: {
  users: User[];
  salesUserId?: string | null;
  presalesUserId?: string | null;
  className?: string;
}) {
  const salesUsers = users.filter((u) => u.role === "SALES" || u.role === "ADMIN");
  const presalesUsers = users.filter((u) => u.role === "PRESALES" || u.role === "ADMIN");

  return (
    <>
      <label className="space-y-1">
        <span className="text-xs text-zinc-500">Sales (销售)</span>
        <select name="salesUserId" defaultValue={salesUserId ?? ""} className={className}>
          <option value="">Unassigned</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs text-zinc-500">Pre-sales (售前)</span>
        <select name="presalesUserId" defaultValue={presalesUserId ?? ""} className={className}>
          <option value="">Unassigned</option>
          {presalesUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>
    </>
  );
}

export function UserRoleSelect({ name = "role", defaultValue = "OTHER", className = input }: {
  name?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={className}>
      {USER_ROLES.map((r) => (
        <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
      ))}
    </select>
  );
}
