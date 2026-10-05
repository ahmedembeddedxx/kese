// Voice and model choices. Everything has a "Default" so the server's
// choice is always one tap away, and the sheet degrades gracefully: with
// no ElevenLabs on the server the voice list is simply hidden and Gemini's
// own voice is used.

import { useEffect, useRef, useState } from "react";
import { CloseIcon, PlayIcon } from "../../components/icons";
import { useI18n } from "../../i18n/useI18n";
import type { ApiClient } from "../../lib/apiClient";
import type { OptionsResponse } from "../../lib/types";
import { useSettingsStore } from "../../store/settingsStore";

interface SettingsSheetProps {
  apiClient: ApiClient;
  onClose: () => void;
}

const SELECT_CLASS =
  "min-h-12 w-full rounded-2xl border border-hairline bg-raised px-4 text-base text-fg disabled:opacity-50";

export function SettingsSheet({ apiClient, onClose }: SettingsSheetProps) {
  const { t } = useI18n();
  const settings = useSettingsStore();
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getOptions()
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [apiClient]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const elevenOn = settings.voiceProvider === "elevenlabs";
  const elevenAvailable = options?.elevenlabs_available ?? false;
  const selectedVoice = options?.voices.find((v) => v.voice_id === (settings.voiceId ?? options.defaults.voice_id));

  function playPreview() {
    const url = selectedVoice?.preview_url;
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    void audioRef.current.play().catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-sheet"
        onClick={(e) => e.stopPropagation()}
        className="sheet-in flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg shadow-2xl sm:mb-8 sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h2 id="settings-title" className="font-display text-2xl font-bold">
            {t("settings")}
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
        <p className="px-5 pb-3 text-sm text-muted">{t("settingsHint")}</p>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-[calc(1.5rem+var(--safe-bottom))]">
          <section aria-labelledby="engine-label" className="space-y-2">
            <h3 id="engine-label" className="text-sm font-semibold text-muted">
              {t("voiceProviderLabel")}
            </h3>
            <div role="radiogroup" aria-labelledby="engine-label" className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "elevenlabs", label: t("engineEleven"), hint: t("engineElevenHint") },
                  { id: "gemini", label: t("engineGemini"), hint: t("engineGeminiHint") },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.voiceProvider === o.id}
                  onClick={() => settings.update({ voiceProvider: o.id })}
                  className={`flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-2xl px-4 text-start ring-1 ${
                    settings.voiceProvider === o.id
                      ? "bg-accent text-accent-fg ring-transparent"
                      : "bg-raised ring-hairline"
                  }`}
                >
                  <span className="font-semibold">{o.label}</span>
                  <span className="text-xs opacity-80">{o.hint}</span>
                </button>
              ))}
            </div>
          </section>

          {failed && (
            <p role="alert" className="text-sm text-danger">
              {t("optionsFailed")}
            </p>
          )}
          {!options && !failed && (
            <p role="status" className="text-sm text-muted">
              {t("loadingOptions")}
            </p>
          )}

          {options && (
            <>
              <section className="space-y-2">
                <label htmlFor="voice-select" className="text-sm font-semibold text-muted">
                  {t("voiceLabel")}
                </label>
                {options.voices.length === 0 ? (
                  <p className="text-sm text-muted">{t("voiceNoList")}</p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      id="voice-select"
                      className={SELECT_CLASS}
                      disabled={!elevenOn || !elevenAvailable}
                      value={settings.voiceId ?? ""}
                      onChange={(e) => settings.update({ voiceId: e.target.value || null })}
                    >
                      <option value="">{t("voiceDefault")}</option>
                      {options.voices.map((v) => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name}
                          {v.description ? ` - ${v.description}` : ""}
                        </option>
                      ))}
                    </select>
                    {selectedVoice?.preview_url && (
                      <button
                        type="button"
                        onClick={playPreview}
                        aria-label={t("voicePreview")}
                        className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg active:scale-95"
                      >
                        <PlayIcon size={20} />
                      </button>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted">{t("modelSection")}</h3>
                <div className="space-y-2">
                  <label htmlFor="tts-select" className="text-sm font-medium">
                    {t("speechModelLabel")}
                  </label>
                  <select
                    id="tts-select"
                    className={SELECT_CLASS}
                    disabled={!elevenOn || !elevenAvailable}
                    value={settings.ttsModel ?? ""}
                    onChange={(e) => settings.update({ ttsModel: e.target.value || null })}
                  >
                    <option value="">{t("modelDefault")}</option>
                    {options.tts_models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="live-select" className="text-sm font-medium">
                    {t("liveModelLabel")}
                  </label>
                  <select
                    id="live-select"
                    className={SELECT_CLASS}
                    value={settings.liveModel ?? ""}
                    onChange={(e) => settings.update({ liveModel: e.target.value || null })}
                  >
                    <option value="">{t("modelDefault")}</option>
                    {options.live_models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            </>
          )}

          <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-6">{t("languagesNote")}</p>
        </div>
      </div>
    </div>
  );
}
