// Shared types for the ElevenLabs voice clients (Scribe STT and the
// text-to-dialogue TTS stream). The WebSocket is abstracted behind a
// minimal interface so both clients can be unit tested with a fake.

/** The subset of the browser WebSocket the voice clients rely on. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface CloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}

/** WebSocket.readyState values, spelled out so tests and clients agree. */
export const WS_CONNECTING = 0;
export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

export const defaultWebSocketFactory: WebSocketFactory = (url) =>
  new WebSocket(url) as unknown as WebSocketLike;
