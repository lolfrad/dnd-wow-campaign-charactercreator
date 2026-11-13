import project from "./data/cloud.json";
/** Pages serves the UI under /<repository>/; the API may live on another host. */
export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);
export const isPages = import.meta.env.MODE === "pages";
export const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL || (isPages ? project.url : "")
).replace(/\/+$/, "");
export const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (isPages ? project.publishableKey : "");
export const cloudEnabled = isPages || !!supabaseUrl;

export function appUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function apiUrl(path: string) {
  if (cloudEnabled && path.startsWith("/wow-assets/"))
    return `${supabaseUrl}/functions/v1/model-assets${path}`;
  return `${apiBase}/${path.replace(/^\/+/, "")}`;
}
