// Home screen: one big "Start fixing" button plus three category tiles,
// "My stuff" (saved devices so a repeat repair starts with context), and
// the Urdu/English toggle, per the plan's UI rules.

import { useEffect, useState } from "react";
import type { ApiClient } from "../../lib/apiClient";
import type { Category, Device } from "../../lib/types";
import { useSessionStore } from "../../store/sessionStore";

interface HomeScreenProps {
  apiClient: ApiClient;
}

const CATEGORIES: { id: Category; label: string; labelUr: string }[] = [
  { id: "electrical", label: "Electrical", labelUr: "بجلی" },
  { id: "ac", label: "AC", labelUr: "اے سی" },
  { id: "car", label: "Car", labelUr: "گاڑی" },
];

type DevicesState =
  | { status: "loading" }
  | { status: "ready"; devices: Device[] }
  | { status: "error"; message: string };

export function HomeScreen({ apiClient }: HomeScreenProps) {
  const { language, setLanguage, startRepair } = useSessionStore();
  const [devicesState, setDevicesState] = useState<DevicesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listDevices()
      .then((devices) => {
        if (!cancelled) setDevicesState({ status: "ready", devices });
      })
      .catch((error: unknown) => {
        // Honesty rule (see services/api kb_store.py): a fetch failure is
        // shown as an error, never silently rendered as "no saved devices".
        if (!cancelled) setDevicesState({ status: "error", message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  return (
    <div className="min-h-dvh flex flex-col px-5 py-8 gap-8 bg-neutral-950 text-white">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLanguage(language === "en" ? "ur" : "en")}
          className="min-h-12 px-4 rounded-full bg-white/10 text-sm"
          data-testid="language-toggle"
        >
          {language === "en" ? "اردو" : "English"}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => startRepair("general")}
          className="min-h-14 w-full max-w-sm rounded-2xl bg-cyan-400 text-black text-lg font-semibold"
          data-testid="start-fixing"
        >
          {language === "ur" ? "ٹھیک کرنا شروع کریں" : "Start fixing"}
        </button>

        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => startRepair(c.id)}
              className="min-h-20 rounded-xl bg-white/10 text-sm"
              data-testid={`category-${c.id}`}
            >
              {language === "ur" ? c.labelUr : c.label}
            </button>
          ))}
        </div>
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-white/60 mb-2">
          {language === "ur" ? "میرا سامان" : "My stuff"}
        </h2>
        {devicesState.status === "loading" && (
          <p className="text-white/50 text-sm">Loading...</p>
        )}
        {devicesState.status === "error" && (
          <p className="text-red-400 text-sm" data-testid="devices-error">
            Couldn't load your saved devices. Check your connection and try again.
          </p>
        )}
        {devicesState.status === "ready" && devicesState.devices.length === 0 && (
          <p className="text-white/50 text-sm">
            {language === "ur" ? "ابھی کچھ محفوظ نہیں" : "Nothing saved yet"}
          </p>
        )}
        {devicesState.status === "ready" && devicesState.devices.length > 0 && (
          <ul className="flex flex-col gap-2">
            {devicesState.devices.map((d) => (
              <li key={d.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                {d.nickname ?? d.kind}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
