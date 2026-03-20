import { createClient } from '@supabase/supabase-js'

let supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
if (supabaseUrl.endsWith('/')) {
  supabaseUrl = supabaseUrl.slice(0, -1);
}
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// CORRECTIF BUG SUPABASE : 
// Intercepteur pour corriger les requêtes utilisant les nouvelles clés "sb_publishable_"
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  if (options && options.headers) {
    const headers = options.headers as Record<string, string>;
    // Si l'entête Authorization contient "Bearer sb_publishable...", on retire le "Bearer "
    if (headers.Authorization && headers.Authorization.includes('Bearer sb_publishable_')) {
      headers.Authorization = headers.Authorization.replace('Bearer ', '');
    }
  }
  return fetch(url, options);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch // On applique notre correctif ici
  }
});