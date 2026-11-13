import { createClient, type Session } from "@supabase/supabase-js";
import { supabaseUrl, supabaseKey } from "./runtime";
import { normalizeUsername, usernameIdentity } from "./username";
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        db: { timeout: 25000, retry: false },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: `token-forge.auth.${new URL(supabaseUrl).hostname.split(".")[0]}`,
        },
      })
    : null;
let session: Session | null = null;
supabase?.auth.onAuthStateChange((_event, next) => {
  session = next;
});
export async function restoreSession() {
  if (!supabase)
    throw new Error("The online forge has not been configured yet.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  session = data.session;
  return session;
}
export function modelHeaders() {
  if (!session) throw new Error("Sign in to load models.");
  return {
    authorization: `Bearer ${session.access_token}`,
    apikey: supabaseKey,
  };
}
export async function signIn(username: string, password: string) {
  if (!supabase)
    throw new Error("The online forge has not been configured yet.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameIdentity(username),
    password,
  });
  if (error) throw new Error("The username or password is incorrect.");
  session = data.session;
  return data.session;
}
export async function createAccount(username: string, password: string) {
  username = normalizeUsername(username);
  if (password.length < 8 || password.length > 72)
    throw new Error("Use a password between 8 and 72 characters.");
  const response = await fetch(`${supabaseUrl}/functions/v1/accounts`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).error ?? "The account could not be created.",
    );
  return signIn(username, password);
}
export function currentUser() {
  return session?.user ?? null;
}
