// Done screen: what was fixed, an offer to save the device, a thumbs up/
// down, and a mocked "pay per fix" credit screen (real payments are out
// of scope for the hackathon per the plan).

import { useState } from "react";
import type { ApiClient } from "../../lib/apiClient";
import { useSessionStore } from "../../store/sessionStore";

interface DoneScreenProps {
  apiClient: ApiClient;
}

export function DoneScreen({ apiClient }: DoneScreenProps) {
  const { category, playbookId, goHome, sessionId } = useSessionStore();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  function sendFeedback(value: "up" | "down") {
    setFeedback(value);
    if (!sessionId) return;
    void apiClient.recordEvent({
      sessionId,
      kind: "feedback",
      playbookId: playbookId ?? undefined,
      detail: { thumbs: value },
    });
  }

  return (
    <div className="min-h-dvh flex flex-col px-5 py-8 gap-6 bg-neutral-950 text-white">
      <h1 className="text-2xl font-semibold">All done</h1>
      <p className="text-white/70">
        {playbookId ? `Fixed: ${playbookId.replace(/-/g, " ")}` : `Session in ${category ?? "general"} mode`}
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => sendFeedback("up")}
          aria-pressed={feedback === "up"}
          className={`min-h-12 min-w-12 px-4 rounded-full ${feedback === "up" ? "bg-emerald-500 text-black" : "bg-white/10"}`}
        >
          👍
        </button>
        <button
          type="button"
          onClick={() => sendFeedback("down")}
          aria-pressed={feedback === "down"}
          className={`min-h-12 min-w-12 px-4 rounded-full ${feedback === "down" ? "bg-red-500 text-black" : "bg-white/10"}`}
        >
          👎
        </button>
      </div>

      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-sm text-white/60 mb-1">Pay per fix (mocked for the hackathon)</p>
        <p className="text-lg">Rs 300</p>
      </div>

      <button
        type="button"
        onClick={goHome}
        className="min-h-12 rounded-xl bg-cyan-400 text-black font-medium"
      >
        Done
      </button>
    </div>
  );
}
