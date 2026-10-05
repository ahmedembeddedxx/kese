// A saved chat: the transcript, plus the few things worth doing after a
// repair (continue, rate it, remember the device). Replaces the old Done
// screen so there is one place for "what happened", whether the session
// just ended or the chat was opened from the history.

import { useEffect, useRef, useState } from "react";
import {
  BackIcon,
  BookmarkIcon,
  CheckIcon,
  MenuIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { ApiClient } from "../../lib/apiClient";
import { timeAgo } from "../../lib/time";
import { useChatStore } from "../../store/chatStore";
import { useSessionStore } from "../../store/sessionStore";

export function ChatScreen({ apiClient }: { apiClient: ApiClient }) {
  const { t } = useI18n();
  const viewChatId = useSessionStore((s) => s.viewChatId);
  const { goHome, continueChat, setDrawerOpen } = useSessionStore();
  const chat = useChatStore((s) => s.chats.find((c) => c.id === viewChatId));
  const { setFeedback, markDeviceSaved } = useChatStore();
  const [saving, setSaving] = useState<"closed" | "open" | "busy" | "failed">("closed");
  const [nickname, setNickname] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chat) goHome();
  }, [chat, goHome]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [chat?.id]);

  if (!chat) return null;

  function rate(value: "up" | "down") {
    if (!chat) return;
    setFeedback(chat.id, value);
    void apiClient
      .recordEvent({ sessionId: chat.id, kind: "feedback", playbookId: chat.playbookId ?? undefined, detail: { thumbs: value } })
      .catch(() => {});
  }

  async function saveDevice() {
    if (!chat) return;
    setSaving("busy");
    try {
      await apiClient.saveDevice({
        kind: chat.playbookId ?? chat.category,
        details: {},
        nickname: nickname.trim() || undefined,
      });
      markDeviceSaved(chat.id);
      setSaving("closed");
    } catch {
      setSaving("failed");
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <header className="flex items-center gap-2 px-3 pt-[calc(0.5rem+var(--safe-top))] pb-2">
        <button
          type="button"
          onClick={goHome}
          aria-label={t("backHome")}
          className="grid size-12 shrink-0 place-items-center rounded-full active:bg-raised"
        >
          <BackIcon size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 dir="auto" className="font-display truncate text-xl font-bold">
            {chat.title}
          </h1>
          <p className="text-xs text-muted">{timeAgo(chat.updatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("menu")}
          className="grid size-12 shrink-0 place-items-center rounded-full active:bg-raised lg:hidden"
        >
          <MenuIcon size={22} />
        </button>
      </header>

      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="transcript">
        {chat.messages.length === 0 && <li className="py-10 text-center text-muted">{t("emptyChat")}</li>}
        {chat.messages.map((m) =>
          m.role === "event" ? (
            <li key={m.id} className="flex justify-center">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold">{m.text}</span>
            </li>
          ) : (
            <li key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p
                dir="auto"
                className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px] leading-6 ${
                  m.role === "user" ? "rounded-ee-lg bg-accent text-accent-fg" : "rounded-es-lg bg-raised ring-1 ring-hairline"
                }`}
              >
                {m.text}
              </p>
            </li>
          ),
        )}
        <div ref={endRef} />
      </ol>

      <footer className="space-y-3 border-t border-hairline bg-bg px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
        {(saving === "open" || saving === "busy" || saving === "failed") && (
          <div className="flex gap-2">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("deviceNickname")}
              aria-label={t("deviceNickname")}
              maxLength={60}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-hairline bg-raised px-4 text-base"
            />
            <button
              type="button"
              onClick={() => void saveDevice()}
              disabled={saving === "busy"}
              className="min-h-12 rounded-2xl bg-accent px-5 font-semibold text-accent-fg disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        )}
        {saving === "failed" && (
          <p role="alert" className="text-sm text-danger">
            {t("errorGeneric")}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => continueChat(chat.id)}
            data-testid="continue-chat"
            className="min-h-14 flex-1 rounded-2xl bg-accent px-6 text-lg font-bold text-accent-fg active:scale-[0.98]"
          >
            {t("continueChat")}
          </button>
          {(["up", "down"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => rate(v)}
              aria-pressed={chat.feedback === v}
              aria-label={v === "up" ? t("helpful") : t("notHelpful")}
              className={`grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-hairline ${
                chat.feedback === v ? "bg-accent text-accent-fg" : "bg-raised"
              }`}
            >
              {v === "up" ? <ThumbUpIcon size={22} /> : <ThumbDownIcon size={22} />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSaving(saving === "closed" ? "open" : "closed")}
            aria-label={chat.deviceSaved ? t("deviceSaved") : t("saveDevice")}
            aria-expanded={saving !== "closed"}
            className={`grid size-14 shrink-0 place-items-center rounded-2xl ring-1 ring-hairline ${
              chat.deviceSaved ? "bg-ok/20 text-ok" : "bg-raised"
            }`}
          >
            {chat.deviceSaved ? <CheckIcon size={22} /> : <BookmarkIcon size={22} />}
          </button>
        </div>
      </footer>
    </div>
  );
}
