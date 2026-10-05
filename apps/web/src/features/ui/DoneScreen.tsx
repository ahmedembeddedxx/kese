// Done: a clear finish, an honest feedback question, and the offer to
// remember this device so the next repair starts with context.

import { useState } from "react";
import { CheckIcon, ThumbDownIcon, ThumbUpIcon } from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { ApiClient } from "../../lib/apiClient";
import { useSessionStore } from "../../store/sessionStore";

interface DoneScreenProps {
  apiClient: ApiClient;
}

export function DoneScreen({ apiClient }: DoneScreenProps) {
  const { t, dir, language } = useI18n();
  const { category, playbookId, goHome, sessionId } = useSessionStore();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [nickname, setNickname] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  function sendFeedback(value: "up" | "down") {
    setFeedback(value);
    if (!sessionId) return;
    void apiClient
      .recordEvent({
        sessionId,
        kind: "feedback",
        playbookId: playbookId ?? undefined,
        detail: { thumbs: value },
      })
      .catch(() => {});
  }

  async function saveDevice() {
    setSaveState("saving");
    try {
      await apiClient.saveDevice({
        kind: playbookId ?? category ?? "general",
        details: {},
        nickname: nickname.trim() || undefined,
      });
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <main
      dir={dir}
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(2rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="grid size-20 place-items-center rounded-full bg-accent text-accent-fg">
          <CheckIcon size={42} strokeWidth={2.4} />
        </div>
        <h1 className="text-3xl font-bold">{t("doneTitle")}</h1>
        <p className="urdu-body text-lg text-muted">{t("doneBody")}</p>

        <div className="flex gap-3">
          {(["up", "down"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => sendFeedback(v)}
              aria-pressed={feedback === v}
              aria-label={v === "up" ? t("helpful") : t("notHelpful")}
              className={`grid size-16 place-items-center rounded-full ring-1 ring-hairline transition-colors ${
                feedback === v ? "bg-accent text-accent-fg" : "bg-raised"
              }`}
            >
              {v === "up" ? <ThumbUpIcon size={28} /> : <ThumbDownIcon size={28} />}
            </button>
          ))}
        </div>
        {feedback && (
          <p className="text-sm text-muted" role="status">
            {t("thanksFeedback")}
          </p>
        )}

        <section className="w-full rounded-3xl bg-raised p-5 text-start ring-1 ring-hairline">
          <h2 className="text-lg font-semibold">{t("saveDevice")}</h2>
          <p className="mt-1 text-sm text-muted">{t("saveDeviceHint")}</p>
          {saveState === "saved" ? (
            <p className="mt-4 flex items-center gap-2 font-semibold text-ok" role="status">
              <CheckIcon size={20} />
              {t("deviceSaved")}
            </p>
          ) : (
            <div className="mt-4 flex gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t("deviceNickname")}
                aria-label={t("deviceNickname")}
                maxLength={60}
                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-hairline bg-bg px-4 text-base"
              />
              <button
                type="button"
                onClick={() => void saveDevice()}
                disabled={saveState === "saving"}
                className="min-h-12 rounded-2xl bg-accent px-5 font-semibold text-accent-fg disabled:opacity-50"
              >
                {t("saveDevice")}
              </button>
            </div>
          )}
          {saveState === "failed" && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {t("errorGeneric")}
            </p>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={goHome}
        className="min-h-14 rounded-2xl bg-accent px-6 text-lg font-semibold text-accent-fg active:scale-[0.98]"
      >
        {t("backHome")}
      </button>
    </main>
  );
}
