// Home. One obvious thing to do (start talking), three quick doors for
// people who already know what is wrong, and one door to the full list of
// guided repairs. Every route ends in the same live screen.

import { useState } from "react";
import { LanguageToggle } from "../../components/LanguageToggle";
import { BoltIcon, CarIcon, MicIcon, SnowflakeIcon, SparkIcon } from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { StringKey } from "../../i18n/strings";
import type { ApiClient } from "../../lib/apiClient";
import type { Category } from "../../lib/types";
import { useSessionStore } from "../../store/sessionStore";
import { PlaybookSheet } from "./PlaybookSheet";

const DOORS: { category: Category; key: StringKey; Icon: typeof BoltIcon }[] = [
  { category: "electrical", key: "categoryElectrical", Icon: BoltIcon },
  { category: "ac", key: "categoryAc", Icon: SnowflakeIcon },
  { category: "car", key: "categoryCar", Icon: CarIcon },
];

/** Viewfinder brackets: the product in one picture (point, and it finds the part). */
function Viewfinder() {
  return (
    <svg viewBox="0 0 160 160" className="size-36 text-accent" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 54V34a16 16 0 0 1 16-16h20" />
        <path d="M142 54V34a16 16 0 0 0-16-16h-20" />
        <path d="M18 106v20a16 16 0 0 0 16 16h20" />
        <path d="M142 106v20a16 16 0 0 1-16 16h-20" />
      </g>
      <circle cx="80" cy="80" r="26" className="fill-accent-soft" />
      <path d="M80 62v36M62 80h36" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

interface HomeScreenProps {
  apiClient: ApiClient;
}

export function HomeScreen({ apiClient }: HomeScreenProps) {
  const { t, dir, language } = useI18n();
  const requestStart = useSessionStore((s) => s.requestStart);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main
      dir={dir}
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(1rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]"
    >
      <header className="flex items-center justify-between">
        <span className="text-2xl font-extrabold tracking-tight">{t("appName")}</span>
        <LanguageToggle />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center">
        <Viewfinder />
        <h1 className="urdu-body max-w-xs text-3xl font-bold leading-snug">{t("tagline")}</h1>
      </section>

      <section className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => requestStart("general")}
          data-testid="start-talking"
          className="flex min-h-16 items-center justify-center gap-3 rounded-3xl bg-accent px-6 text-xl font-bold text-accent-fg shadow-lg shadow-accent/25 active:scale-[0.98]"
        >
          <MicIcon size={26} />
          <span className="flex flex-col items-start leading-tight">
            <span>{t("startTalking")}</span>
            <span className="text-xs font-medium opacity-75">{t("startTalkingHint")}</span>
          </span>
        </button>

        <div className="grid grid-cols-3 gap-3">
          {DOORS.map(({ category, key, Icon }) => (
            <button
              key={category}
              type="button"
              onClick={() => requestStart(category)}
              data-testid={`door-${category}`}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl bg-raised text-base font-semibold ring-1 ring-hairline active:scale-[0.97]"
            >
              <Icon size={28} className="text-accent" />
              {t(key)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          data-testid="choose-repair"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl text-base font-semibold text-accent"
        >
          <SparkIcon size={20} />
          {t("chooseRepair")}
        </button>
      </section>

      {sheetOpen && (
        <PlaybookSheet
          apiClient={apiClient}
          onClose={() => setSheetOpen(false)}
          onPick={(p) => {
            setSheetOpen(false);
            requestStart(p.category, p.id);
          }}
        />
      )}
    </main>
  );
}
