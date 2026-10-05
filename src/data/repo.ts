import type {
  Attempt,
  NewQuestion,
  Question,
  RawResults,
  StudentModule,
  TeacherModule,
  TestForStudent,
  TestForTeacher,
  Viewer,
} from './types'

/**
 * The only seam between the screens and the database.
 *
 * Screens never import the Supabase client: they call this. Two implementations
 * exist — `supabaseRepo` (the real one) and `fakeRepo` (in-memory, same demo
 * class as supabase/seed.sql) so the interface can be built and tested without
 * Docker or a project.
 *
 * Isolation is NOT this interface's promise. Own-results-only is enforced by
 * Row Level Security in the database; the fake only imitates it so that a screen
 * written against the fake behaves the same way against the real one.
 */
export interface PulseRepo {
  auth: {
    /** The signed-in viewer, or null. */
    current(): Promise<Viewer | null>
    signIn(email: string, password: string): Promise<Viewer>
    /** First visit: creates the account from a pre-created profile. NO_PROFILE when the email is unknown. */
    claimProfile(email: string, password: string): Promise<Viewer>
    /** Always resolves: never reveal whether an email exists. */
    requestPasswordReset(email: string): Promise<void>
    signOut(): Promise<void>
  }

  student: {
    /** The modules of this student's classes, each with the state of its entrance test. */
    modules(): Promise<StudentModule[]>
    module(moduleId: string): Promise<StudentModule | null>
    /** The published test of that module, with this student's attempt and answers. */
    test(moduleId: string): Promise<TestForStudent | null>
    /** ATTEMPT_EXISTS if one is already open or handed in. */
    startAttempt(moduleId: string): Promise<Attempt>
    /** Autosave. ATTEMPT_CLOSED once handed in — never a silent no-op. */
    saveAnswer(attemptId: string, questionId: string, response: string): Promise<void>
    /** Irreversible, stamped by the server's clock. */
    handIn(attemptId: string): Promise<Attempt>
  }

  teacher: {
    modules(): Promise<TeacherModule[]>
    /** Every student's answers for that module's test. Master only. */
    rawResults(moduleId: string): Promise<RawResults>

    /** The draft being written, or the published one if there is no draft. */
    test(moduleId: string): Promise<TestForTeacher | null>
    /**
     * Starts a draft for this module. If a published test exists, this is its
     * next version — a live test is never edited in place.
     */
    createDraft(moduleId: string): Promise<TestForTeacher>
    addQuestion(testId: string, question: NewQuestion): Promise<Question>
    updateQuestion(questionId: string, question: NewQuestion): Promise<Question>
    removeQuestion(questionId: string): Promise<void>
    /** Irreversible: the questions freeze and students can take it. */
    publish(testId: string): Promise<void>
  }
}
