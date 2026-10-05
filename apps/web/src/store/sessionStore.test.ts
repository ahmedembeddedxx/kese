import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./sessionStore";

function reset(consented: boolean) {
  useSessionStore.setState({
    screen: "home",
    category: null,
    playbookId: null,
    consented,
    session: null,
    sessionId: null,
  });
}

describe("start flow", () => {
  beforeEach(() => window.localStorage.clear());

  it("goes through consent the first time", () => {
    reset(false);
    useSessionStore.getState().requestStart("electrical", "fan-capacitor-replace");
    expect(useSessionStore.getState().screen).toBe("consent");
    expect(useSessionStore.getState().playbookId).toBe("fan-capacitor-replace");
  });

  it("accepting consent starts the live screen and remembers the choice", () => {
    reset(false);
    useSessionStore.getState().requestStart("general");
    useSessionStore.getState().acceptConsent();
    expect(useSessionStore.getState().screen).toBe("live");
    expect(useSessionStore.getState().consented).toBe(true);
    expect(window.localStorage.getItem("mend.consent.v1")).toBe("1");
  });

  it("declining returns home without consenting", () => {
    reset(false);
    useSessionStore.getState().requestStart("general");
    useSessionStore.getState().declineConsent();
    expect(useSessionStore.getState().screen).toBe("home");
    expect(useSessionStore.getState().consented).toBe(false);
  });

  it("skips consent once given", () => {
    reset(true);
    useSessionStore.getState().requestStart("ac");
    expect(useSessionStore.getState().screen).toBe("live");
  });
});
