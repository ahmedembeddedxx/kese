// Two-option segmented control. Each option is labelled in its OWN
// language and script, so someone who cannot read the current UI language
// can still find theirs.

import { useI18n } from "../i18n/useI18n";
import { useSessionStore } from "../store/sessionStore";

export function LanguageToggle() {
  const { language, t } = useI18n();
  const setLanguage = useSessionStore((s) => s.setLanguage);
  const options = [
    { code: "ur" as const, label: "اردو" },
    { code: "en" as const, label: "EN" },
  ];
  return (
    <div
      role="group"
      aria-label={t("language")}
      dir="ltr"
      className="inline-flex rounded-full border border-hairline bg-raised p-1"
    >
      {options.map((o) => (
        <button
          key={o.code}
          type="button"
          lang={o.code}
          aria-pressed={language === o.code}
          onClick={() => setLanguage(o.code)}
          className={`min-h-10 min-w-12 rounded-full px-3 text-sm font-semibold transition-colors ${
            language === o.code ? "bg-accent text-accent-fg" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
