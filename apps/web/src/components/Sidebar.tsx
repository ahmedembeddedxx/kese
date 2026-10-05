// Navigation: new chat, saved chats, settings. A fixed column on wide
// screens and a slide-in drawer on phones (see AppShell). Chats are stored
// in this browser only.

import { useState } from "react";
import { useI18n } from "../i18n/useI18n";
import { useChatStore } from "../store/chatStore";
import { useSessionStore } from "../store/sessionStore";
import { ChatRow } from "./ChatRow";
import { CloseIcon, PlusIcon, SettingsIcon, TrashIcon } from "./icons";

export function Sidebar({ showClose = false }: { showClose?: boolean }) {
  const { t } = useI18n();
  const chats = useChatStore((s) => s.chats);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const { screen, viewChatId, openChat, goHome, setDrawerOpen, setSettingsOpen } = useSessionStore();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <nav aria-label={t("chats")} className="flex h-full flex-col gap-3 px-3 pt-[calc(0.75rem+var(--safe-top))] pb-[calc(0.75rem+var(--safe-bottom))]">
      <div className="flex items-center justify-between px-2">
        <span className="font-display text-2xl font-extrabold tracking-tight">{t("appName")}</span>
        {showClose && (
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setDrawerOpen(false)}
            className="grid size-11 place-items-center rounded-full"
          >
            <CloseIcon size={22} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={goHome}
        data-testid="new-chat"
        className="flex min-h-12 items-center gap-2 rounded-2xl bg-accent px-4 font-semibold text-accent-fg active:scale-[0.98]"
      >
        <PlusIcon size={20} />
        {t("newChat")}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="chat-list">
        {chats.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted">{t("noChats")}</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => (
              <li key={chat.id}>
                <ChatRow
                  chat={chat}
                  active={screen === "chat" && viewChatId === chat.id}
                  onOpen={() => openChat(chat.id)}
                  trailing={
                    <button
                      type="button"
                      aria-label={confirmId === chat.id ? t("confirmDelete") : t("deleteChat")}
                      onClick={() => {
                        if (confirmId === chat.id) {
                          deleteChat(chat.id);
                          setConfirmId(null);
                        } else {
                          setConfirmId(chat.id);
                        }
                      }}
                      onBlur={() => setConfirmId((id) => (id === chat.id ? null : id))}
                      className={`grid size-11 shrink-0 place-items-center rounded-full ${
                        confirmId === chat.id ? "bg-danger text-white" : "text-muted"
                      }`}
                    >
                      <TrashIcon size={18} />
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="flex min-h-12 items-center gap-3 rounded-2xl px-3 font-medium active:bg-raised"
      >
        <SettingsIcon size={20} />
        {t("settings")}
      </button>
    </nav>
  );
}
