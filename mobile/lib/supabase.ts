// The ONLY place this app talks to Supabase directly — and only for Auth
// (sign-in, sign-up confirmation, refresh, sign-out). No screen ever calls
// `supabase.from(table)`; every piece of application data goes through the
// Express API (lib/api.ts) instead, exactly like the web app. See the Expo
// Readiness Audit, Section 08 (Database/Supabase Boundary) for why: this
// Supabase project also hosts unrelated tables with RLS disabled, and the
// anon key bundled here must never be used to query them.
import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy mobile/.env.example to mobile/.env and fill in the values from the same Supabase project the web app uses.'
  );
}

// Backs the Supabase session (access token + refresh token) with the
// platform Keychain/Keystore via expo-secure-store — never AsyncStorage,
// which is unencrypted on-device storage. This is the one place an
// authentication credential is persisted in this app.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // No browser URL to parse a session out of on a native client.
    detectSessionInUrl: false,
    // Recommended by Supabase for React Native — avoids a rare deadlock
    // between concurrent auth calls on some devices.
    lock: processLock,
  },
});
