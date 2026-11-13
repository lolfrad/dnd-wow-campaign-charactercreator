/** Pages serves the UI under /<repository>/; the API may live on another host. */
export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);
export const isPages = import.meta.env.MODE === "pages";

export function appUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function apiUrl(path: string) {
  return `${apiBase}/${path.replace(/^\/+/, "")}`;
}
