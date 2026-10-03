// Thin wrapper around `@google/genai`'s Live API, opened directly from
// the browser with the ephemeral token `/session` minted (the real
// Gemini API key never reaches the phone, per the plan's architecture).
//
// NOT YET EXERCISED AGAINST A LIVE SESSION (no Gemini API key is
// available in this environment -- see handover.md). The shapes below
// (`ai.live.connect`, `Blob` audio/video fields, `FunctionCall`) are read
// directly from the installed `@google/genai` type declarations, so they
// should match the SDK; what's unverified is the actual server behavior.
// Before the first real demo, run this against a real ephemeral token and
// fix anything that disagrees -- flag that verification in the PR that
// wires up the Gemini API key, per AGENTS.md.

import {
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";

export interface LiveSessionCallbacks {
  onAudioBase64: (pcm16Base64: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>, callId: string) => void;
  onTurnComplete: () => void;
  onError: (error: unknown) => void;
  onClose: () => void;
}

export interface OpenLiveSessionArgs {
  ephemeralToken: string;
  model: string;
  toolDeclarations: Record<string, unknown>[];
  callbacks: LiveSessionCallbacks;
}

export interface LiveSessionHandle {
  sendAudioChunkBase64: (pcm16Base64: string) => void;
  sendVideoFrameJpegBase64: (jpegBase64: string) => void;
  sendToolResponse: (callId: string, response: Record<string, unknown>) => void;
  close: () => void;
}

export async function openLiveSession(args: OpenLiveSessionArgs): Promise<LiveSessionHandle> {
  const client = new GoogleGenAI({ apiKey: args.ephemeralToken });

  const session: Session = await client.live.connect({
    model: args.model,
    config: {
      responseModalities: [Modality.AUDIO],
      tools: [{ functionDeclarations: args.toolDeclarations as unknown as FunctionDeclaration[] }],
    },
    callbacks: {
      onopen: () => {},
      onmessage: (message: LiveServerMessage) => handleServerMessage(message, args.callbacks),
      onerror: (error: unknown) => args.callbacks.onError(error),
      onclose: () => args.callbacks.onClose(),
    },
  });

  return {
    sendAudioChunkBase64: (pcm16Base64) => {
      session.sendRealtimeInput({
        audio: { data: pcm16Base64, mimeType: "audio/pcm;rate=16000" },
      });
    },
    sendVideoFrameJpegBase64: (jpegBase64) => {
      session.sendRealtimeInput({ video: { data: jpegBase64, mimeType: "image/jpeg" } });
    },
    sendToolResponse: (callId, response) => {
      session.sendToolResponse({ functionResponses: [{ id: callId, response }] });
    },
    close: () => session.close(),
  };
}

function handleServerMessage(message: LiveServerMessage, callbacks: LiveSessionCallbacks): void {
  if (message.data) {
    callbacks.onAudioBase64(message.data);
  }
  if (message.toolCall?.functionCalls) {
    for (const call of message.toolCall.functionCalls) {
      callbacks.onToolCall(call.name ?? "", call.args ?? {}, call.id ?? "");
    }
  }
  if (message.serverContent?.turnComplete) {
    callbacks.onTurnComplete();
  }
}
