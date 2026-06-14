"use client";

import { useCallback, useState } from "react";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";

export function useAiStream() {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<AiTraceStep[]>([]);
  const [replyText, setReplyText] = useState("");

  const reset = useCallback(() => {
    setTrace([]);
    setReplyText("");
  }, []);

  const request = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setLoading(true);
      reset();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ ...body, stream: true }),
        });
        const result = await consumeAiSse(res, (_ev, state: AiStreamState) => {
          setTrace(state.trace);
          setReplyText(state.replyText);
        });
        return result;
      } finally {
        setLoading(false);
      }
    },
    [reset]
  );

  return { loading, trace, replyText, liveText: replyText, request, reset };
}
