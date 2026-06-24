export type TodoOwnerOption = { id: string; name: string };

export function encodeTodoOwnerRef(kind: "partner" | "customer", id: string): string {
  return `${kind}:${id}`;
}

export function parseTodoOwnerRef(value: string): { partnerId: string | null; customerId: string | null } {
  const raw = value.trim();
  if (!raw) return { partnerId: null, customerId: null };
  const [kind, id] = raw.split(":");
  if (kind === "partner" && id) return { partnerId: id, customerId: null };
  if (kind === "customer" && id) return { partnerId: null, customerId: id };
  return { partnerId: null, customerId: null };
}

export function appendTodoOwnerToFormData(formData: FormData): void {
  const ref = String(formData.get("ownerRef") ?? "");
  formData.delete("ownerRef");
  const { partnerId, customerId } = parseTodoOwnerRef(ref);
  if (partnerId) formData.set("partnerId", partnerId);
  if (customerId) formData.set("customerId", customerId);
}

export function parseOwnerRef(value: string): { kind: "partner" | "customer"; id: string } | null {
  const { partnerId, customerId } = parseTodoOwnerRef(value);
  if (partnerId) return { kind: "partner", id: partnerId };
  if (customerId) return { kind: "customer", id: customerId };
  return null;
}
