"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}
