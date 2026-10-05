import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../lib/apiClient";
import { useSessionStore } from "../../store/sessionStore";
import { ConsentScreen } from "./ConsentScreen";
import { DoneScreen } from "./DoneScreen";
import { HomeScreen } from "./HomeScreen";
import { PlaybookSheet } from "./PlaybookSheet";

function fakeApi(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    listPlaybooks: vi.fn().mockResolvedValue([
      { id: "a", category: "electrical", title: "Fix A", title_ur: "اے ٹھیک کریں", risk: "low" },
      { id: "b", category: "car", title: "Fix B", title_ur: "بی ٹھیک کریں", risk: "high" },
    ]),
    saveDevice: vi.fn().mockResolvedValue({ id: "d1" }),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ApiClient;
}

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  useSessionStore.setState({ screen: "home", language: "en", consented: false, sessionId: "s1" });
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

  it("switches language", async () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    await userEvent.click(screen.getByRole("button", { name: "اردو" }));
    expect(useSessionStore.getState().language).toBe("ur");
  });

  it("has no Repeat or I'm stuck buttons anywhere", () => {
    render(<HomeScreen apiClient={fakeApi()} />);
    expect(screen.queryByText(/repeat|stuck/i)).toBeNull();
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
    await userEvent.click(screen.getByRole("button", { name: "I understand, continue" }));
    expect(useSessionStore.getState().screen).toBe("live");
  });
});

describe("DoneScreen", () => {
  it("records feedback and saves the device", async () => {
    const api = fakeApi();
    useSessionStore.setState({ screen: "done", category: "electrical", playbookId: "fan-capacitor-replace" });
    render(<DoneScreen apiClient={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(api.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "feedback", detail: { thumbs: "up" } }),
    );
    await userEvent.type(screen.getByLabelText("Nickname (optional)"), "Bedroom fan");
    await userEvent.click(screen.getByRole("button", { name: "Save this device" }));
    expect(api.saveDevice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "fan-capacitor-replace", nickname: "Bedroom fan" }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("tells the user when saving fails instead of failing silently", async () => {
    const api = fakeApi({ saveDevice: vi.fn().mockRejectedValue(new Error("no")) });
    render(<DoneScreen apiClient={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Save this device" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
