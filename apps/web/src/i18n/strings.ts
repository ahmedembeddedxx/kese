// All user-facing copy, in both languages, in one place. Urdu is the
// primary language of the product; English is the secondary. Keys are
// typed so a missing translation is a compile error, not a blank label.

export type Language = "en" | "ur";

const en = {
  appName: "Mend",
  tagline: "Point your camera. Talk. We'll fix it together.",
  startTalking: "Start talking",
  startTalkingHint: "Opens your camera and microphone",
  chooseRepair: "Choose a specific repair",
  chooseRepairTitle: "What are we fixing?",
  anything: "Anything",
  anythingHint: "Point at it and ask",
  categoryElectrical: "Electrical",
  categoryAc: "AC",
  categoryCar: "Car",
  categoryGeneral: "Anything",
  risk_low: "Easy",
  risk_medium: "Careful",
  risk_high: "Risky",
  language: "Language",
  loadingRepairs: "Loading repairs",
  noRepairs: "No repairs available right now.",
  retry: "Try again",
  close: "Close",

  consentTitle: "Before we start",
  consentBody:
    "Mend watches through your camera (or the screen you share) and listens through your microphone while you talk. Frames are sent to Google Gemini to understand what you are pointing at, and your speech is processed to answer you. We do not keep the video or audio.",
  consentAgree: "I understand, continue",
  consentCancel: "Not now",
  aiDisclosure: "Mend is an AI. It can be wrong. Never touch anything live.",

  connecting: "Getting ready",
  connectingHint: "Connecting to your helper",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  paused: "Paused",
  reconnecting: "Reconnecting",
  tapToTalk: "Tap to talk",
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
  captions: "Captions",
  you: "You",
  mend: "Mend",
  tapWire: "Tap the wire you mean",

  gateTitle: "Safety check",
  gateNotYet: "Not yet",
  gateConfirm: "Yes, done",
  gateNotYetHint: "Mend will wait until you are ready.",

  errorCamera: "Camera access is needed so Mend can see. Allow it in your browser settings.",
  errorMic: "Microphone access is needed so Mend can hear you.",
  errorGeneric: "Something went wrong. Please try again.",
  errorConsent: "You need to agree before we can start.",
  errorBusy: "Too many tries. Wait a moment and try again.",
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
  fixAnother: "Fix something else",
} as const;

export type StringKey = keyof typeof en;

const ur: Record<StringKey, string> = {
  appName: "مینڈ",
  tagline: "کیمرہ دکھائیں، بات کریں، ہم مل کر ٹھیک کریں گے۔",
  startTalking: "بات شروع کریں",
  startTalkingHint: "کیمرہ اور مائیک کھلے گا",
  chooseRepair: "کوئی خاص مرمت چنیں",
  chooseRepairTitle: "کیا ٹھیک کرنا ہے؟",
  anything: "کچھ بھی",
  anythingHint: "دکھائیں اور پوچھیں",
  categoryElectrical: "بجلی",
  categoryAc: "اے سی",
  categoryCar: "گاڑی",
  categoryGeneral: "کچھ بھی",
  risk_low: "آسان",
  risk_medium: "احتیاط",
  risk_high: "خطرناک",
  language: "زبان",
  loadingRepairs: "مرمتیں لوڈ ہو رہی ہیں",
  noRepairs: "ابھی کوئی مرمت دستیاب نہیں۔",
  retry: "دوبارہ کوشش کریں",
  close: "بند کریں",

  consentTitle: "شروع کرنے سے پہلے",
  consentBody:
    "مینڈ آپ کے کیمرے (یا شیئر کی گئی اسکرین) سے دیکھتا اور مائیک سے سنتا ہے۔ آپ جس چیز کی طرف اشارہ کریں اسے سمجھنے کے لیے تصویریں گوگل جیمنی کو بھیجی جاتی ہیں، اور آپ کی آواز جواب دینے کے لیے پروسیس ہوتی ہے۔ ہم ویڈیو یا آڈیو محفوظ نہیں کرتے۔",
  consentAgree: "سمجھ گیا، آگے بڑھیں",
  consentCancel: "ابھی نہیں",
  aiDisclosure: "مینڈ ایک اے آئی ہے اور غلطی کر سکتا ہے۔ کرنٹ والی چیز کو کبھی نہ چھوئیں۔",

  connecting: "تیاری ہو رہی ہے",
  connectingHint: "آپ کے مددگار سے رابطہ ہو رہا ہے",
  listening: "سن رہا ہوں",
  thinking: "سوچ رہا ہوں",
  speaking: "بول رہا ہوں",
  paused: "رکا ہوا",
  reconnecting: "دوبارہ رابطہ",
  tapToTalk: "بولنے کے لیے دبائیں",
  micOn: "مائیک بند کریں",
  micOff: "مائیک کھولیں",
  flipCamera: "کیمرہ بدلیں",
  shareScreen: "اسکرین شیئر کریں",
  stopShare: "شیئرنگ بند کریں",
  torchOn: "روشنی جلائیں",
  torchOff: "روشنی بند کریں",
  endSession: "ختم",
  stepsTitle: "مراحل",
  stepOf: "مرحلہ {n} از {total}",
  captions: "کیپشن",
  you: "آپ",
  mend: "مینڈ",
  tapWire: "جس تار کی بات ہے اسے دبائیں",

  gateTitle: "حفاظتی جانچ",
  gateNotYet: "ابھی نہیں",
  gateConfirm: "جی، ہو گیا",
  gateNotYetHint: "جب آپ تیار ہوں گے مینڈ انتظار کرے گا۔",

  errorCamera: "کیمرے کی اجازت چاہیے تاکہ مینڈ دیکھ سکے۔ براؤزر کی سیٹنگ میں اجازت دیں۔",
  errorMic: "مائیک کی اجازت چاہیے تاکہ مینڈ آپ کو سن سکے۔",
  errorGeneric: "کچھ گڑبڑ ہو گئی۔ دوبارہ کوشش کریں۔",
  errorConsent: "شروع کرنے سے پہلے آپ کی رضامندی ضروری ہے۔",
  errorBusy: "بہت زیادہ کوششیں۔ تھوڑا رک کر دوبارہ کوشش کریں۔",
  voiceFallback: "متبادل آواز استعمال ہو رہی ہے",

  doneTitle: "کام مکمل",
  doneBody: "شاباش۔ کیسا رہا؟",
  helpful: "مددگار",
  notHelpful: "مددگار نہیں",
  thanksFeedback: "شکریہ، اس سے ہمیں بہتر بننے میں مدد ملتی ہے۔",
  saveDevice: "یہ آلہ محفوظ کریں",
  saveDeviceHint: "اگلی بار مینڈ اسے پہلے سے جانتا ہوگا۔",
  deviceSaved: "محفوظ ہو گیا",
  deviceNickname: "نام (اختیاری)",
  backHome: "شروع پر واپس",
  fixAnother: "کچھ اور ٹھیک کریں",
};

export const STRINGS: Record<Language, Record<StringKey, string>> = { en, ur };

export function translate(
  language: Language,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  let text = STRINGS[language][key] ?? STRINGS.en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
