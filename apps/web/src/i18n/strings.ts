// All user-facing copy in one place. The UI is English only. The VOICE is
// separate: the agent hears and answers in English or Urdu, auto-detected,
// so people can speak either way (captions follow the spoken language).

const en = {
  appName: "Mend",
  tagline: "Point your camera. Talk. We'll fix it together.",
  startTalking: "Start talking",
  startTalkingHint: "Opens your camera and microphone",
  chooseRepair: "Choose a specific repair",
  chooseRepairTitle: "What are we fixing?",
  anything: "Anything",
  categoryElectrical: "Electrical",
  categoryAc: "AC",
  categoryCar: "Car",
  risk_low: "Easy",
  risk_medium: "Careful",
  risk_high: "Risky",
  loadingRepairs: "Loading repairs",
  noRepairs: "No repairs available right now.",
  retry: "Try again",
  close: "Close",

  settings: "Settings",
  settingsHint: "Changes apply to your next session.",
  voiceSection: "Voice",
  voiceProviderLabel: "Voice engine",
  engineEleven: "ElevenLabs",
  engineGemini: "Gemini",
  engineElevenHint: "Natural voice in English and Urdu.",
  engineGeminiHint: "Built-in Gemini voice.",
  voiceLabel: "Voice",
  voiceDefault: "Default voice",
  voicePreview: "Play sample",
  voiceNoList: "Voices are not available right now.",
  modelSection: "Models",
  speechModelLabel: "Speech model",
  liveModelLabel: "Vision model",
  modelDefault: "Default",
  languagesNote: "Speak English or Urdu. Mend answers in the language you use.",
  loadingOptions: "Loading options",
  optionsFailed: "Could not load the options.",

  consentTitle: "Before we start",
  consentBody:
    "Mend watches through your camera (or the screen you share) and listens through your microphone while you talk. Frames are sent to Google Gemini to understand what you are pointing at, and your speech is processed to answer you. We do not keep the video or audio.",
  consentAgree: "I understand, continue",
  consentCancel: "Not now",
  aiDisclosure: "Mend is an AI. It can be wrong. Never touch anything live.",

  connecting: "Getting ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting",
  micOn: "Mute microphone",
  micOff: "Unmute microphone",
  flipCamera: "Switch camera",
  shareScreen: "Share screen",
  stopShare: "Stop sharing",
  torchOn: "Turn on light",
  torchOff: "Turn off light",
  endSession: "End",
  stepsTitle: "Steps",
  stepOf: "Step {n} of {total}",
  tapWire: "Tap the wire you mean",

  gateTitle: "Safety check",
  gateNotYet: "Not yet",
  gateConfirm: "Yes, done",

  errorCamera: "Camera access is needed so Mend can see. Allow it in your browser settings.",
  errorMic: "Microphone access is needed so Mend can hear you.",
  errorGeneric: "Something went wrong. Please try again.",
  errorConsent: "You need to agree before we can start.",
  errorBusy: "Too many tries. Wait a moment and try again.",
  errorOption: "That voice or model is not available. Pick another in Settings.",
  voiceFallback: "Using the backup voice",

  doneTitle: "All done",
  doneBody: "Nice work. How did it go?",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  thanksFeedback: "Thanks, that helps us improve.",
  saveDevice: "Save this device",
  saveDeviceHint: "Next time Mend already knows it.",
  deviceSaved: "Saved",
  deviceNickname: "Nickname (optional)",
  backHome: "Back to start",
} as const;

export type StringKey = keyof typeof en;

export const STRINGS: Record<StringKey, string> = en;

export function translate(key: StringKey, vars?: Record<string, string | number>): string {
  let text: string = STRINGS[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
