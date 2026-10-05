// Home. One obvious action (Start), three quick doors, a scroller of
// guided fixes and the latest chats. Short labels, big targets, everything
// reachable with a thumb. Every route ends in the same live screen.

import { useEffect, useState } from "react";
import { ChatRow } from "../../components/ChatRow";
import {
  BoltIcon,
  CameraIcon,
  CarIcon,
  ChevronIcon,
  MenuIcon,
  SettingsIcon,
  SnowflakeIcon,
} from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { StringKey } from "../../i18n/strings";
import type { ApiClient } from "../../lib/apiClient";
import type { Category, PlaybookSummary } from "../../lib/types";
import { useChatStore } from "../../store/chatStore";
import { useSessionStore } from "../../store/sessionStore";
import { PlaybookSheet } from "./PlaybookSheet";

const DOORS: { category: Category; key: StringKey; Icon: typeof BoltIcon }[] = [
  { category: "electrical", key: "categoryElectrical", Icon: BoltIcon },
  { category: "ac", key: "categoryAc", Icon: SnowflakeIcon },
  { category: "car", key: "categoryCar", Icon: CarIcon },
];

const CATEGORY_ICON = { electrical: BoltIcon, ac: SnowflakeIcon, car: CarIcon, general: BoltIcon } as const;
const RISK_DOT = { low: "bg-ok", medium: "bg-accent", high: "bg-danger" } as const;
const RISK_KEY = { low: "risk_low", medium: "risk_medium", high: "risk_high" } as const;

interface HomeScreenProps {
  apiClient: ApiClient;
}

export function HomeScreen({ apiClient }: HomeScreenProps) {
  const { t } = useI18n();
  const requestStart = useSessionStore((s) => s.requestStart);
  const setDrawerOpen = useSessionStore((s) => s.setDrawerOpen);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);
  const openChat = useSessionStore((s) => s.openChat);
  const chats = useChatStore((s) => s.chats);
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listPlaybooks()
      .then((list) => !cancelled && setPlaybooks(list))
      .catch(() => !cancelled && setPlaybooks([]));
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const recent = chats.slice(0, 3);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-5 pt-[calc(0.75rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("menu")}
          data-testid="open-menu"
          className="grid size-12 place-items-center rounded-full bg-raised ring-1 ring-hairline active:scale-95 lg:invisible"
        >
          <MenuIcon size={22} />
        </button>
        <span className="font-display text-2xl font-extrabold tracking-tight lg:invisible">{t("appName")}</span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("settings")}
          data-testid="open-settings"
          className="grid size-12 place-items-center rounded-full bg-raised ring-1 ring-hairline active:scale-95"
        >
          <SettingsIcon size={22} />
        </button>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-5 py-4">
        <button
          type="button"
          onClick={() => requestStart("general")}
          data-testid="start-talking"
          aria-label={`${t("startTalking")}. ${t("startTalkingHint")}`}
          className="relative grid size-44 place-items-center rounded-full bg-accent text-accent-fg shadow-xl shadow-accent/30 transition-transform active:scale-95"
        >
          <span className="ring-pulse absolute inset-0 rounded-full bg-accent" aria-hidden="true" />
          <span className="absolute -inset-3 rounded-full ring-1 ring-accent/30" aria-hidden="true" />
          <span className="relative flex flex-col items-center gap-1">
            <CameraIcon size={52} strokeWidth={1.6} />
            <span className="font-display text-xl font-bold">{t("startTalking")}</span>
          </span>
        </button>
        <h1 className="font-display text-center text-4xl font-bold leading-tight tracking-tight">{t("tagline")}</h1>
      </section>

      <div className="grid grid-cols-3 gap-3">
        {DOORS.map(({ category, key, Icon }) => (
          <button
            key={category}
            type="button"
            onClick={() => requestStart(category)}
            data-testid={`door-${category}`}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-raised text-sm font-semibold ring-1 ring-hairline active:scale-[0.97]"
          >
            <Icon size={22} className="text-accent" />
            {t(key)}
          </button>
        ))}
      </div>

      <section aria-labelledby="guided-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="guided-title" className="text-base font-bold">
            {t("guided")}
          </h2>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            data-testid="choose-repair"
            className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-accent"
          >
            {t("chooseRepair")}
            <ChevronIcon size={16} />
          </button>
        </div>
        <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1" data-testid="guided-scroller">
          {playbooks === null &&
            [0, 1, 2].map((i) => <div key={i} className="h-24 w-40 shrink-0 animate-pulse rounded-2xl bg-raised" aria-hidden="true" />)}
          {playbooks?.slice(0, 10).map((p) => {
            const Icon = CATEGORY_ICON[p.category];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => requestStart(p.category, p.id, { title: p.title })}
                className="flex h-24 w-40 shrink-0 snap-start flex-col justify-between rounded-2xl bg-raised p-3 text-start ring-1 ring-hairline active:scale-[0.97]"
              >
                <span className="flex items-center justify-between">
                  <Icon size={20} className="text-accent" />
                  <span
                    role="img"
                    aria-label={t(RISK_KEY[p.risk])}
                    title={t(RISK_KEY[p.risk])}
                    className={`size-2.5 rounded-full ${RISK_DOT[p.risk]}`}
                  />
                </span>
                <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-title" className="space-y-1 lg:hidden">
          <h2 id="recent-title" className="text-base font-bold">
            {t("recent")}
          </h2>
          {recent.map((chat) => (
            <ChatRow key={chat.id} chat={chat} onOpen={() => openChat(chat.id)} />
          ))}
        </section>
      )}

      {sheetOpen && (
        <PlaybookSheet
          apiClient={apiClient}
          onClose={() => setSheetOpen(false)}
          onPick={(p) => {
            setSheetOpen(false);
            requestStart(p.category, p.id, { title: p.title });
          }}
        />
      )}
    </div>
  );
}
