import { useEffect, useMemo } from "react";
import { ApiClient } from "./lib/apiClient";
import { MockApiClient } from "./lib/mockApi";
import { IS_MOCK_LIVE } from "./features/live/useLiveSession";
import { getAuthToken } from "./lib/auth";
import { ConsentScreen } from "./features/ui/ConsentScreen";
import { DoneScreen } from "./features/ui/DoneScreen";
import { HomeScreen } from "./features/ui/HomeScreen";
import { LiveScreen } from "./features/ui/LiveScreen";
import { useSessionStore } from "./store/sessionStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const screen = useSessionStore((s) => s.screen);
  const language = useSessionStore((s) => s.language);
  const apiClient = useMemo(
    () => {
      const options = { baseUrl: API_BASE_URL, getAuthToken };
      return IS_MOCK_LIVE ? new MockApiClient(options) : new ApiClient(options);
    },
    [],
  );

  // Keep <html> in step with the UI language so the browser picks the right
  // fonts, text direction, hyphenation and screen-reader voice.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);

  if (screen === "live") return <LiveScreen apiBaseUrl={API_BASE_URL} apiClient={apiClient} />;
  if (screen === "consent") return <ConsentScreen />;
  if (screen === "done") return <DoneScreen apiClient={apiClient} />;
  return <HomeScreen apiClient={apiClient} />;
}

export default App;
