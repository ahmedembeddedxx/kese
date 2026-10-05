// Frame around Home and the chat view: a persistent sidebar on wide
// screens, a slide-in drawer on phones, and the settings sheet. The live
// screen is deliberately outside this shell: it is full-screen camera.

import { type ReactNode, useEffect } from "react";
import { SettingsSheet } from "../features/ui/SettingsSheet";
import type { ApiClient } from "../lib/apiClient";
import { useSessionStore } from "../store/sessionStore";
import { Sidebar } from "./Sidebar";

export function AppShell({ apiClient, children }: { apiClient: ApiClient; children: ReactNode }) {
  const drawerOpen = useSessionStore((s) => s.drawerOpen);
  const settingsOpen = useSessionStore((s) => s.settingsOpen);
  const setDrawerOpen = useSessionStore((s) => s.setDrawerOpen);
  const setSettingsOpen = useSessionStore((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawerOpen]);

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-80 shrink-0 border-e border-hairline bg-raised/40 lg:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" data-testid="drawer">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50 fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="drawer-in absolute inset-y-0 start-0 w-[86%] max-w-sm bg-bg shadow-2xl">
            <Sidebar showClose />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>

      {settingsOpen && <SettingsSheet apiClient={apiClient} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
