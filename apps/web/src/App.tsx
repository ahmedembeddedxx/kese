import { useMemo } from "react";
import { ApiClient } from "./lib/apiClient";
import { getAuthToken } from "./lib/auth";
import { DoneScreen } from "./features/ui/DoneScreen";
import { HomeScreen } from "./features/ui/HomeScreen";
import { LiveScreen } from "./features/ui/LiveScreen";
import { useSessionStore } from "./store/sessionStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const screen = useSessionStore((s) => s.screen);
  const apiClient = useMemo(
    () => new ApiClient({ baseUrl: API_BASE_URL, getAuthToken }),
    [],
  );

  if (screen === "live") return <LiveScreen apiBaseUrl={API_BASE_URL} />;
  if (screen === "done") return <DoneScreen apiClient={apiClient} />;
  return <HomeScreen apiClient={apiClient} />;
}

export default App;
