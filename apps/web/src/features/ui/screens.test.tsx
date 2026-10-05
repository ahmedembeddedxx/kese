import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../../components/AppShell";
import type { ApiClient } from "../../lib/apiClient";
import { useChatStore } from "../../store/chatStore";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { ChatScreen } from "./ChatScreen";
import { ConsentScreen } from "./ConsentScreen";
import { HomeScreen } from "./HomeScreen";
import { PlaybookSheet } from "./PlaybookSheet";
import { SettingsSheet } from "./SettingsSheet";

const OPTIONS = {
  voices: [
    { voice_id: "voice0001", name: "Aria", category: "premade", description: "Warm", preview_url: null },
    { voice_id: "voice0002", name: "Roger", category: "premade", description: null, preview_url: null },
  ],
  live_models: [{ id: "live-a", label: "Live A" }],
  tts_models: [
    { id: "eleven_v4_turbo", label: "Turbo (fastest)" },
    { id: "eleven_v3", label: "v3 (most expressive)" },
  ],
  defaults: { voice_id: "voice0001", live_model: "live-a", tts_model: "eleven_v4_turbo", voice_provider: "elevenlabs" as const },
  elevenlabs_available: true,
};

function fakeApi(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listPlaybooks: vi.fn().mockResolvedValue([
      { id: "a", category: "electrical", title: "Fix A", title_ur: "x", risk: "low" },
      { id: "b", category: "car", title: "Fix B", title_ur: "y", risk: "high" },
    ]),
    saveDevice: vi.fn().mockResolvedValue({ id: "d1" }),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    getOptions: vi.fn().mockResolvedValue(OPTIONS),
    ...overrides,
  } as unknown as ApiClient;
}

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  useChatStore.setState({ chats: [] });
  useSessionStore.setState({
    screen: "home",
    consented: false,
    sessionId: null,
    viewChatId: null,
    activeChatId: null,
    pendingChatId: null,
    pendingTitle: null,
    drawerOpen: false,
    settingsOpen: false,
  });
  useSettingsStore.getState().reset();
});

describe("HomeScreen", () => {
  it("starts an open-ended session from the main button", async () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(screen.getByTestId("start-talking"));
    expect(useSessionStore.getState().category).toBe("general");
    expect(useSessionStore.getState().screen).toBe("consent");
  });

  it("offers a door for every category", async () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(screen.getByTestId("door-ac"));
    expect(useSessionStore.getState().category).toBe("ac");
  });

  it("shows guided fixes in a scroller and starts one with its title", async () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(await screen.findByRole("button", { name: /Fix B/ }));
    const s = useSessionStore.getState();
    expect(s.playbookId).toBe("b");
    expect(s.category).toBe("car");
    expect(s.pendingTitle).toBe("Fix B");
  });

  it("lists the latest chats and opens one", async () => {
    const id = useChatStore.getState().createChat({ category: "ac", playbookId: null, title: "Bedroom AC" });
    useChatStore.getState().addMessage(id, "user", "it leaks");
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(screen.getByText("Bedroom AC"));
    expect(useSessionStore.getState().screen).toBe("chat");
    expect(useSessionStore.getState().viewChatId).toBe(id);
  });

  it("opens the menu and settings", async () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(screen.getByTestId("open-menu"));
    expect(useSessionStore.getState().drawerOpen).toBe(true);
    await userEvent.click(screen.getByTestId("open-settings"));
    expect(useSessionStore.getState().settingsOpen).toBe(true);
  });

  it("is branded and has no Repeat, stuck or language controls", () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    expect(screen.getAllByText("Kese AI").length).toBeGreaterThan(0);
    expect(screen.queryByText(/repeat|stuck/i)).toBeNull();
    expect(screen.queryByText("اردو")).toBeNull();
  });
});

describe("AppShell and sidebar", () => {
  it("lists chats, opens one and deletes with a second tap", async () => {
    const id = useChatStore.getState().createChat({ category: "car", playbookId: null, title: "Engine noise" });
    useChatStore.getState().addMessage(id, "user", "knocking sound");
    useSessionStore.setState({ drawerOpen: true });
    render(
      <AppShell apiClient={fakeApi()}>
        <div>page</div>
      </AppShell>,
    );
    const drawer = screen.getByTestId("drawer");
    await userEvent.click(within(drawer).getByText("Engine noise"));
    expect(useSessionStore.getState().viewChatId).toBe(id);
    expect(useSessionStore.getState().drawerOpen).toBe(false);

    act(() => useSessionStore.setState({ drawerOpen: true }));
    const del = within(await screen.findByTestId("drawer")).getByRole("button", { name: "Delete chat" });
    await userEvent.click(del);
    expect(useChatStore.getState().chats).toHaveLength(1);
    await userEvent.click(within(screen.getByTestId("drawer")).getByRole("button", { name: "Tap again to delete" }));
    expect(useChatStore.getState().chats).toHaveLength(0);
  });

  it("starts a new chat from the sidebar", async () => {
    useSessionStore.setState({ screen: "chat", drawerOpen: true });
    render(
      <AppShell apiClient={fakeApi()}>
        <div>page</div>
      </AppShell>,
    );
    await userEvent.click(within(screen.getByTestId("drawer")).getByTestId("new-chat"));
    expect(useSessionStore.getState().screen).toBe("home");
  });
});

describe("PlaybookSheet", () => {
  it("lists playbooks, filters by category and picks one", async () => {
    const onPick = vi.fn();
    render(<PlaybookSheet apiClient={fakeApi()} onPick={onPick} onClose={() => {}} />);
    expect(await screen.findByText("Fix A")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Car" }));
    expect(screen.queryByText("Fix A")).toBeNull();
    await userEvent.click(screen.getByText("Fix B"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("shows an error with retry when loading fails", async () => {
    const listPlaybooks = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue([]);
    render(<PlaybookSheet apiClient={fakeApi({ listPlaybooks })} onPick={() => {}} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No repairs available right now.")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<PlaybookSheet apiClient={fakeApi()} onPick={() => {}} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ConsentScreen", () => {
  it("only starts after the user agrees", async () => {
    useSessionStore.setState({ screen: "consent" });
    render(<ConsentScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(useSessionStore.getState().screen).toBe("live");
  });
});

describe("ChatScreen", () => {
  function openChatWithMessages() {
    const id = useChatStore.getState().createChat({ category: "electrical", playbookId: "fan-capacitor-replace", title: "Fan" });
    useChatStore.getState().addMessage(id, "user", "it hums");
    useChatStore.getState().addMessage(id, "agent", "Check the capacitor.");
    useChatStore.getState().addMessage(id, "event", "Step 2: Switch off");
    useSessionStore.setState({ screen: "chat", viewChatId: id });
    return id;
  }

  it("shows the transcript and continues the chat", async () => {
    const id = openChatWithMessages();
    render(<ChatScreen apiClient={fakeApi()} />);
    expect(screen.getByText("it hums")).toBeInTheDocument();
    expect(screen.getByText("Check the capacitor.")).toBeInTheDocument();
    expect(screen.getByText("Step 2: Switch off")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("continue-chat"));
    const s = useSessionStore.getState();
    expect(s.pendingChatId).toBe(id);
    expect(s.playbookId).toBe("fan-capacitor-replace");
    expect(s.screen).toBe("consent");
  });

  it("records feedback on the chat and to the API", async () => {
    const id = openChatWithMessages();
    const api = fakeApi();
    render(<ChatScreen apiClient={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(useChatStore.getState().chats.find((c) => c.id === id)?.feedback).toBe("up");
    expect(api.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "feedback", detail: { thumbs: "up" } }));
  });

  it("saves the device with a nickname and marks it saved", async () => {
    const id = openChatWithMessages();
    const api = fakeApi();
    render(<ChatScreen apiClient={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Save this device" }));
    await userEvent.type(screen.getByLabelText("Nickname (optional)"), "Bedroom fan");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.saveDevice).toHaveBeenCalledWith(expect.objectContaining({ kind: "fan-capacitor-replace", nickname: "Bedroom fan" }));
    expect(useChatStore.getState().chats.find((c) => c.id === id)?.deviceSaved).toBe(true);
  });

  it("tells the user when saving fails", async () => {
    openChatWithMessages();
    const api = fakeApi({ saveDevice: vi.fn().mockRejectedValue(new Error("no")) });
    render(<ChatScreen apiClient={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Save this device" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("goes home when the chat no longer exists", () => {
    useSessionStore.setState({ screen: "chat", viewChatId: "missing" });
    render(<ChatScreen apiClient={fakeApi()} />);
    expect(useSessionStore.getState().screen).toBe("home");
  });
});

describe("finishing a repair", () => {
  it("drops an empty chat and goes home, but keeps one with messages", () => {
    const empty = useChatStore.getState().createChat({ category: "general", playbookId: null });
    useSessionStore.setState({ screen: "live", activeChatId: empty });
    useSessionStore.getState().finishRepair();
    expect(useChatStore.getState().chats).toHaveLength(0);
    expect(useSessionStore.getState().screen).toBe("home");

    const full = useChatStore.getState().createChat({ category: "general", playbookId: null });
    useChatStore.getState().addMessage(full, "user", "hi");
    useSessionStore.setState({ screen: "live", activeChatId: full });
    useSessionStore.getState().finishRepair();
    expect(useSessionStore.getState().screen).toBe("chat");
    expect(useSessionStore.getState().viewChatId).toBe(full);
  });
});

describe("SettingsSheet", () => {
  it("saves a chosen voice and model and lets you go back to the default", async () => {
    render(<SettingsSheet apiClient={fakeApi()} onClose={() => {}} />);
    await screen.findByLabelText("Voice");
    await userEvent.selectOptions(screen.getByLabelText("Voice"), "voice0002");
    await userEvent.selectOptions(screen.getByLabelText("Speech model"), "eleven_v3");
    expect(useSettingsStore.getState()).toMatchObject({ voiceId: "voice0002", ttsModel: "eleven_v3" });
    await userEvent.selectOptions(screen.getByLabelText("Voice"), "");
    expect(useSettingsStore.getState().voiceId).toBeNull();
  });

  it("switches the voice engine and disables ElevenLabs-only controls for Gemini", async () => {
    render(<SettingsSheet apiClient={fakeApi()} onClose={() => {}} />);
    await screen.findByLabelText("Voice");
    await userEvent.click(screen.getByRole("radio", { name: /Gemini/ }));
    expect(useSettingsStore.getState().voiceProvider).toBe("gemini");
    expect(screen.getByLabelText("Voice")).toBeDisabled();
    expect(screen.getByLabelText("Speech model")).toBeDisabled();
    expect(screen.getByLabelText("Vision model")).not.toBeDisabled();
  });

  it("explains when the options cannot be loaded", async () => {
    const api = fakeApi({ getOptions: vi.fn().mockRejectedValue(new Error("x")) });
    render(<SettingsSheet apiClient={api} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the options.");
  });
});
