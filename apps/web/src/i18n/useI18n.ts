import { type StringKey, translate } from "./strings";

/** Stable function; the UI has a single language so no store subscription is needed. */
export function useI18n() {
  return { t: (key: StringKey, vars?: Record<string, string | number>) => translate(key, vars) };
}
