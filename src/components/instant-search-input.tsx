"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function InstantSearchInputInner({
  param = "q",
  placeholder,
  className,
  debounceMs = 300,
}: {
  param?: string;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(urlValue);
  }, [urlValue]);

  const push = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();
      if (trimmed) params.set(param, trimmed);
      else params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [param, pathname, router, searchParams],
  );

  const schedulePush = useCallback(
    (next: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => push(next), debounceMs);
    },
    [debounceMs, push],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <input
      type="search"
      name={param}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        schedulePush(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (timerRef.current) clearTimeout(timerRef.current);
          push(value);
        }
      }}
      onBlur={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (value.trim() !== urlValue.trim()) push(value);
      }}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}

export function InstantSearchInput(props: {
  param?: string;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}) {
  return (
    <Suspense
      fallback={
        <input
          type="search"
          placeholder={props.placeholder}
          className={props.className}
          disabled
        />
      }
    >
      <InstantSearchInputInner {...props} />
    </Suspense>
  );
}
