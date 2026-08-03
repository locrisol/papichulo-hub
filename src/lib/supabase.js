import { createClient } from '@supabase/supabase-js'

// One client for the whole app. Everything that talks to the database imports
// this, so the session is shared and there is only one place to configure.
//
// The anon key is meant to be in the browser and is safe there, but only because
// row level security is set up on every table. It is the database that decides
// what this key can actually see, not the key itself.
//
// The service_role key must never appear anywhere in here. It goes past every
// policy, and anything shipped to the browser can be read by anyone.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)