// First-run disclosure, shown once before the camera or microphone is
// touched. One clear primary action and a plain "Not now", per the HIG
// pre-permission pattern. The server also refuses to start a session
// without consent, so this is enforced, not decorative.

import { ShieldIcon } from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import { useSessionStore } from "../../store/sessionStore";

export function ConsentScreen() {
  const { t } = useI18n();
  const accept = useSessionStore((s) => s.acceptConsent);
  const decline = useSessionStore((s) => s.declineConsent);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(1rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="flex flex-1 flex-col justify-center gap-5">
        <div className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent">
          <ShieldIcon size={34} />
        </div>
        <h1 className="text-3xl font-bold leading-snug">{t("consentTitle")}</h1>
        <p className="text-lg leading-8 text-muted">{t("consentBody")}</p>
        <p className="rounded-2xl bg-raised p-4 text-base leading-7 ring-1 ring-hairline">
          {t("aiDisclosure")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={accept}
          className="min-h-14 rounded-2xl bg-accent px-6 text-lg font-semibold text-accent-fg active:scale-[0.98]"
        >
          {t("consentAgree")}
        </button>
        <button type="button" onClick={decline} className="min-h-12 rounded-2xl px-6 text-base font-medium text-muted">
          {t("consentCancel")}
        </button>
      </div>
    </main>
  );
}
