import { useCallback } from "react";
import { useSessionStore } from "../store/sessionStore";
import { type Language, type StringKey, translate } from "./strings";

export function useI18n() {
  const language = useSessionStore((s) => s.language);
  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  );
  return { t, language: language as Language, dir: language === "ur" ? ("rtl" as const) : ("ltr" as const) };
}
