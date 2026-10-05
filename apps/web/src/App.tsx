import { useMemo } from "react";
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
  const apiClient = useMemo(
    () => {
      const options = { baseUrl: API_BASE_URL, getAuthToken };
      return IS_MOCK_LIVE ? new MockApiClient(options) : new ApiClient(options);
    },
    [],
  );

  if (screen === "live") return <LiveScreen apiBaseUrl={API_BASE_URL} apiClient={apiClient} />;
  if (screen === "consent") return <ConsentScreen />;
  if (screen === "done") return <DoneScreen apiClient={apiClient} />;
  return <HomeScreen apiClient={apiClient} />;
}

export default App;
