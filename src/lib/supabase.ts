import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_PLACEHOLDER = 'your_supabase_project_url';
const SUPABASE_ANON_KEY_PLACEHOLDER = 'your_supabase_anon_key';

export const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'cuerate-media';

export const isSupabaseConfigured =
  SUPABASE_URL.length > 0 && 
  SUPABASE_ANON_KEY.length > 0 &&
  !SUPABASE_URL.includes(SUPABASE_URL_PLACEHOLDER) &&
  !SUPABASE_ANON_KEY.includes(SUPABASE_ANON_KEY_PLACEHOLDER);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
