// "Choose a specific repair": a modal bottom sheet listing the reviewed
// playbooks, filterable by category. Every playbook is reachable here,
// and the Home screen's other routes start an open-ended session, so
// nothing a customer might want is ever missing.

import { useCallback, useEffect, useState } from "react";
import { ChevronIcon, CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { StringKey } from "../../i18n/strings";
import type { ApiClient } from "../../lib/apiClient";
import type { Category, PlaybookSummary } from "../../lib/types";

const FILTERS: { id: Category | "all"; key: StringKey }[] = [
  { id: "all", key: "anything" },
  { id: "electrical", key: "categoryElectrical" },
  { id: "ac", key: "categoryAc" },
  { id: "car", key: "categoryCar" },
];

const RISK_KEY = { low: "risk_low", medium: "risk_medium", high: "risk_high" } as const;
const RISK_CLASS = {
  low: "text-ok",
  medium: "text-accent",
  high: "text-danger",
} as const;

interface PlaybookSheetProps {
  apiClient: ApiClient;
  onPick: (playbook: PlaybookSummary) => void;
  onClose: () => void;
}

export function PlaybookSheet({ apiClient, onPick, onClose }: PlaybookSheetProps) {
  const { t, language, dir } = useI18n();
  const [items, setItems] = useState<PlaybookSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Category | "all">("all");

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listPlaybooks()
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apiClient, attempt]);

  const load = useCallback(() => {
    setFailed(false);
    setItems(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = (items ?? []).filter((p) => filter === "all" || p.category === filter);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        dir={dir}
        data-testid="playbook-sheet"
        onClick={(e) => e.stopPropagation()}
        className="sheet-in flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg shadow-2xl sm:mb-8 sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="sheet-title" className="text-xl font-bold">
            {t("chooseRepairTitle")}
          </h2>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full bg-raised ring-1 ring-hairline"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto px-5 pb-3" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${
                filter === f.id ? "bg-accent text-accent-fg" : "bg-raised text-muted ring-1 ring-hairline"
              }`}
            >
              {t(f.key)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-[calc(1rem+var(--safe-bottom))]">
          {items === null && !failed && (
            <p className="px-3 py-8 text-center text-muted" role="status">
              {t("loadingRepairs")}
            </p>
          )}
          {failed && (
            <div className="flex flex-col items-center gap-3 px-3 py-8" role="alert">
              <p className="text-muted">{t("errorGeneric")}</p>
              <button type="button" onClick={load} className="min-h-11 rounded-full bg-accent px-5 font-semibold text-accent-fg">
                {t("retry")}
              </button>
            </div>
          )}
          {items !== null && visible.length === 0 && (
            <p className="px-3 py-8 text-center text-muted">{t("noRepairs")}</p>
          )}
          <ul>
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-start active:bg-raised"
                >
                  <span lang={language} className="flex-1 text-lg leading-8">
                    {language === "ur" ? p.title_ur : p.title}
                  </span>
                  <span className={`text-xs font-semibold ${RISK_CLASS[p.risk]}`}>{t(RISK_KEY[p.risk])}</span>
                  <ChevronIcon size={18} className="text-muted rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
