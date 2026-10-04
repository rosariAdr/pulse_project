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

// Maps database error codes raised by the triggers to interface messages.
export function messageForDbError(message: string): string {
  if (message.includes("PULSE_NO_PROFILE")) return en.door.noProfile;
  if (message.includes("PULSE_REPORT_FROZEN")) return en.exercise.frozen;
  return en.common.error;
}
