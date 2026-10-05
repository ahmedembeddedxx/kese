// All user-facing copy in one place. The UI is English only. The VOICE is
// separate: the agent hears and answers in English or Urdu, auto-detected,
// so people can speak either way (captions follow the spoken language).

const en = {
  appName: "Kese AI",
  tagline: "Show it. Ask how.",
  startTalking: "Start",
  startTalkingHint: "Opens camera and mic",
  chooseRepair: "See all",
  chooseRepairTitle: "Guided fixes",
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
  languagesNote: "Speak English or Urdu. Kese AI answers in the language you use.",
  loadingOptions: "Loading options",
  optionsFailed: "Could not load the options.",

  consentTitle: "Before we start",
  consentBody:
    "Kese AI sees through your camera (or shared screen) and hears through your microphone. Frames go to Google Gemini to understand what you show; speech is processed to answer you. Video and audio are not kept. Chats are saved only in this browser.",
  consentAgree: "Continue",
  consentCancel: "Not now",
  aiDisclosure: "AI can be wrong. Never touch anything live.",

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

  errorCamera: "Allow camera access in your browser settings so Kese AI can see.",
  errorMic: "Allow microphone access so Kese AI can hear you.",
  errorGeneric: "Something went wrong. Please try again.",
  errorConsent: "You need to agree before we can start.",
  errorBusy: "Too many tries. Wait a moment and try again.",
  errorOption: "That voice or model is not available. Pick another in Settings.",
  voiceFallback: "Using the backup voice",

    helpful: "Helpful",
  notHelpful: "Not helpful",
  thanksFeedback: "Thanks, that helps us improve.",
  saveDevice: "Save this device",
  saveDeviceHint: "Next time it is already known.",
  deviceSaved: "Saved",
  deviceNickname: "Nickname (optional)",
  backHome: "Back",

  save: "Save",
  newChat: "New chat",
  chats: "Chats",
  noChats: "No chats yet",
  recent: "Recent",
  guided: "Guided fixes",
  menu: "Menu",
  deleteChat: "Delete chat",
  confirmDelete: "Tap again to delete",
  continueChat: "Continue",
  emptyChat: "Nothing was said in this chat.",
  rateHelpful: "Helpful",
  you: "You",
  agent: "Kese AI",
  savedHere: "Saved in this browser",
  starting: "Starting camera",
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
