import { useMemo } from "react";
import { AppShell } from "./components/AppShell";
import { ChatScreen } from "./features/ui/ChatScreen";
import { ConsentScreen } from "./features/ui/ConsentScreen";
import { HomeScreen } from "./features/ui/HomeScreen";
import { LiveScreen } from "./features/ui/LiveScreen";
import { IS_MOCK_LIVE } from "./features/live/useLiveSession";
import { ApiClient } from "./lib/apiClient";
import { getAuthToken } from "./lib/auth";
import { MockApiClient } from "./lib/mockApi";
import { useSessionStore } from "./store/sessionStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const screen = useSessionStore((s) => s.screen);
  const apiClient = useMemo(() => {
    const options = { baseUrl: API_BASE_URL, getAuthToken };
    return IS_MOCK_LIVE ? new MockApiClient(options) : new ApiClient(options);
  }, []);

  if (screen === "live") return <LiveScreen apiBaseUrl={API_BASE_URL} apiClient={apiClient} />;
  if (screen === "consent") return <ConsentScreen />;
  return (
    <AppShell apiClient={apiClient}>
      {screen === "chat" ? <ChatScreen apiClient={apiClient} /> : <HomeScreen apiClient={apiClient} />}
    </AppShell>
  );
}

export default App;
