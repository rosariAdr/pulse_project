import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Null until the EU Supabase project exists and .env.local is filled in.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
