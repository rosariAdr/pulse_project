import 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    supabase: { url: string; key: string }
  }
}
