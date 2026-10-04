// Pulse — interface strings (V0: English shell, decided 3 Oct 2026).
// Every UI string lives here so a French shell (fr.ts with the same keys) can be added later.
// Course CONTENT is not here: it keeps the language of its module.

export const en = {
  door: {
    signIn: "Sign in",
    email: "School email",
    password: "Password",
    firstVisit: "First time here? Create your password",
    createPassword: "Create my password",
    forgot: "Forgot your password?",
    sendReset: "Send me a reset link",
    resetSent: "If this email has a Pulse profile, a reset link is on its way.",
    noProfile: "This email has no Pulse profile. Check the address your teacher registered, or ask them.",
  },
  nav: {
    home: "Home",
    myModules: "My modules",
    myResults: "My results",
    myProgress: "My progress",
    rawResults: "Raw results",
    signOut: "Sign out",
    menu: "Menu",
  },
  test: {
    start: "Start the entrance test",
    resume: "Resume the test",
    saved: "Saved",
    saving: "Saving…",
    timeLeft: (min: number) => `${min} min left`,
    handIn: "Hand in",
    confirmHandIn: "Hand in now? You won't be able to change your answers.",
    handedIn: "Handed in. Your module is unlocked.",
    closed: "This test is closed.",
  },
  exercise: {
    submit: "Submit",
    late: "Late",
    lateNote: "Submitted after the next session opened. It still counts in your progress.",
    frozen: "Your on-time answer is now part of the session report and can no longer be edited.",
  },
  status: {
    handedIn: "Handed in",
    inProgress: "In progress",
    notStarted: "Not started",
    draft: "Draft",
    published: "Published",
    prepared: "Prepared",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    back: "Back",
    next: "Next",
    exportCsv: "Export CSV",
    demoData: "Demo data — fictional",
    error: "Something went wrong. Try again.",
  },
} as const;

export type Strings = typeof en;

// What the student or teacher reads when the data layer refuses something.
// The keys are PulseErrorCode (src/data/types.ts); every refusal has a sentence,
// because a silent failure in class is worse than a blunt one.
export const errorMessages = {
  NO_PROFILE: en.door.noProfile,
  BAD_CREDENTIALS: "That email and password do not match.",
  ATTEMPT_CLOSED: "You have already handed this test in, so it can no longer change.",
  ATTEMPT_EXISTS: "You have already started this test.",
  TEST_NOT_AVAILABLE: "This test is not open.",
  TIME_UP: "The time for this test has run out. Your saved answers were kept.",
  ANSWER_TOO_LONG: "That answer is too long. Shorten it and it will save.",
  NOT_AUTHORISED: "You cannot do that.",
  UNKNOWN: en.common.error,
} as const;

export function messageForError(code: keyof typeof errorMessages): string {
  return errorMessages[code] ?? en.common.error;
}

// Trigger names, for the rare path where a raw database message surfaces.
export function messageForDbError(message: string): string {
  if (message.includes("PULSE_NO_PROFILE")) return en.door.noProfile;
  if (message.includes("PULSE_REPORT_FROZEN")) return en.exercise.frozen;
  if (message.includes("PULSE_ATTEMPT_CLOSED")) return errorMessages.ATTEMPT_CLOSED;
  if (message.includes("PULSE_TIME_UP")) return errorMessages.TIME_UP;
  return en.common.error;
}
