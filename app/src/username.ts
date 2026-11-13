export function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    throw new Error(
      "Use 3–24 letters, numbers or underscores for your username.",
    );
  return username;
}
export const usernameIdentity = (username: string) =>
  `${normalizeUsername(username)}@users.tokenforge.invalid`;
