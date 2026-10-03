// Auth token source for apiClient. Mirrors the backend's dev-mode bypass
// (services/api/app/auth.py, decisions.md D-006): until a Firebase
// project is configured (no project ID available yet, see handover.md),
// the app generates and persists a random anonymous id and sends it as
// `dev:<uid>`, which the backend only accepts outside production.
//
// Swap `getAuthToken` for a real Firebase ID token once
// `VITE_FIREBASE_*` env vars are set -- the apiClient interface doesn't
// need to change, only this function's implementation.

const DEV_UID_STORAGE_KEY = "mend.dev_uid";

function getOrCreateDevUid(): string {
  try {
    const existing = window.localStorage.getItem(DEV_UID_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEV_UID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing / blocked storage: fall back to an in-memory id
    // for this page load only, so the app still works, just without a
    // persisted "same user next time" identity.
    return crypto.randomUUID();
  }
}

export function getAuthToken(): string | null {
  const firebaseIdToken = readFirebaseIdTokenIfConfigured();
  if (firebaseIdToken) return firebaseIdToken;
  return `dev:${getOrCreateDevUid()}`;
}

function readFirebaseIdTokenIfConfigured(): string | null {
  // Placeholder: wired up once a Firebase project exists. Returning null
  // here falls through to the dev token above.
  return null;
}
