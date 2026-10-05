// One saved chat in a list. A whole-row tap target (min 56px high) with a
// category icon, the title and a compact time. Used by the sidebar and by
// "Recent" on Home.

import type { ReactNode } from "react";
import type { Chat } from "../store/chatStore";
import { timeAgo } from "../lib/time";
import { BoltIcon, CarIcon, ChatIcon, SnowflakeIcon } from "./icons";

const ICONS = { electrical: BoltIcon, ac: SnowflakeIcon, car: CarIcon, general: ChatIcon } as const;

interface ChatRowProps {
  chat: Chat;
  active?: boolean;
  onOpen: () => void;
  trailing?: ReactNode;
}

export function ChatRow({ chat, active = false, onOpen, trailing }: ChatRowProps) {
  const Icon = ICONS[chat.category];
  return (
    <div
      className={`flex items-center gap-1 rounded-2xl ${active ? "bg-accent-soft" : "active:bg-raised"}`}
      data-testid="chat-row"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-start"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raised text-accent ring-1 ring-hairline">
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[15px] font-semibold">
            {chat.title}
          </span>
          <span className="block text-xs text-muted">{timeAgo(chat.updatedAt)}</span>
        </span>
      </button>
      {trailing}
    </div>
  );
}
