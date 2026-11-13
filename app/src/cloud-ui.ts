import {
  createAccount,
  signIn,
  restoreSession,
  currentUser,
  supabase,
} from "./cloud-client";
import { cloudRepository } from "./cloud-repository";
import type { CloudCharacter } from "./document-store";
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let authentication: Promise<void> | undefined;
export async function requireSignIn() {
  if (await restoreSession()) return;
  if (authentication) return authentication;
  authentication = new Promise<void>((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "account-dialog";
    dialog.setAttribute("aria-label", "Token Forge account");
    let signup = false;
    const render = () => {
      dialog.innerHTML = `<div class="account-brand">Token Forge</div><h1>${signup ? "Create your account" : "Welcome to the forge"}</h1><p>Build characters, save them online and share them with your party.</p><form id="account-form"><label>Username<input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24" required></label><label>Password<input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" maxlength="72" required></label>${signup ? '<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label><p class="account-note">No email or password recovery. Keep your password safe; if you lose it, you lose account access.</p>' : ""}<p class="account-error" role="alert"></p><button class="primary wide" type="submit">${signup ? "Create account" : "Sign in"}</button></form><button id="account-toggle" class="secondary wide">${signup ? "Already have an account? Sign in" : "Create an account"}</button>`;
      dialog.querySelector("#account-toggle")!.addEventListener("click", () => {
        signup = !signup;
        render();
      });
      dialog
        .querySelector("form")!
        .addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = event.target as HTMLFormElement,
            values = new FormData(form),
            button = form.querySelector("button")!,
            error = form.querySelector(".account-error")!;
          button.disabled = true;
          error.textContent = "";
          try {
            const username = String(values.get("username")),
              password = String(values.get("password"));
            if (signup && password !== values.get("confirm"))
              throw new Error("Passwords do not match.");
            if (signup) await createAccount(username, password);
            else await signIn(username, password);
            dialog.close();
            dialog.remove();
            authentication = undefined;
            resolve();
          } catch (reason) {
            error.textContent =
              reason instanceof Error ? reason.message : String(reason);
            button.disabled = false;
          }
        });
    };
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    render();
    document.body.append(dialog);
    dialog.showModal();
  });
  return authentication;
}

export async function showLibrary(
  open: (document: CloudCharacter) => Promise<void>,
  deleted: (id: string) => Promise<void>,
) {
  const dialog = document.createElement("dialog");
  dialog.className = "library-dialog";
  dialog.setAttribute("aria-label", "My characters");
  document.body.append(dialog);
  dialog.showModal();
  let page = 0;
  const render = async () => {
    dialog.innerHTML = "<p>Loading characters…</p>";
    try {
      const rows = await cloudRepository.list(page);
      const paths = rows
        .map((row) => row.thumbnail_path)
        .filter((path): path is string => !!path);
      const signed = paths.length
        ? await supabase!.storage
            .from("character-thumbnails")
            .createSignedUrls(paths, 300)
        : { data: [] };
      const urls = new Map(
        (signed.data ?? []).map((item) => [item.path, item.signedUrl]),
      );
      dialog.innerHTML = `<div class="dialog-heading"><h1>My characters</h1><button data-close aria-label="Close library">✕</button></div><div class="library-grid">${rows.map((row) => `<article><button class="library-card" data-open="${row.id}">${urls.get(row.thumbnail_path ?? "") ? `<img src="${esc(urls.get(row.thumbnail_path!))}" alt="">` : '<span class="library-placeholder">✦</span>'}<strong>${esc(row.name)}</strong><small>${esc(new Date(row.updated_at).toLocaleDateString())}</small></button><button class="library-delete" data-delete="${row.id}">Delete</button></article>`).join("") || "<p>Your library is empty. Start a new character to save your first build.</p>"}</div><div class="dialog-pagination"><button id="library-previous" class="secondary" ${page === 0 ? "disabled" : ""}>Previous</button><span>Page ${page + 1}</span><button id="library-next" class="secondary" ${rows.length < 24 ? "disabled" : ""}>Next</button></div><p class="account-error" role="alert"></p>`;
      dialog
        .querySelector("[data-close]")!
        .addEventListener("click", () => dialog.close());
      dialog.querySelector("#library-next")!.addEventListener("click", () => {
        page++;
        void render();
      });
      dialog
        .querySelector("#library-previous")!
        .addEventListener("click", () => {
          page--;
          void render();
        });
      dialog
        .querySelectorAll<HTMLButtonElement>("[data-open]")
        .forEach((button) =>
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await open(rows.find((row) => row.id === button.dataset.open)!);
              dialog.close();
            } catch (error) {
              dialog.querySelector("[role=alert]")!.textContent =
                error instanceof Error ? error.message : String(error);
              button.disabled = false;
            }
          }),
        );
      dialog
        .querySelectorAll<HTMLButtonElement>("[data-delete]")
        .forEach((button) =>
          button.addEventListener("click", async () => {
            if (button.dataset.confirm !== "yes") {
              button.dataset.confirm = "yes";
              button.textContent = "Delete permanently";
              return;
            }
            try {
              button.disabled = true;
              await cloudRepository.remove(
                rows.find((row) => row.id === button.dataset.delete)!,
              );
              await deleted(button.dataset.delete!);
              await render();
            } catch (error) {
              dialog.querySelector("[role=alert]")!.textContent =
                error instanceof Error ? error.message : String(error);
              button.disabled = false;
            }
          }),
        );
    } catch (error) {
      dialog.innerHTML = `<p role="alert">${esc(error instanceof Error ? error.message : error)}</p><button data-close class="secondary">Close</button>`;
      dialog
        .querySelector("[data-close]")!
        .addEventListener("click", () => dialog.close());
    }
  };
  dialog.addEventListener("close", () => dialog.remove());
  await render();
}

export async function showSharing(character: CloudCharacter) {
  const dialog = document.createElement("dialog");
  dialog.className = "sharing-dialog";
  dialog.setAttribute("aria-label", "Share character");
  document.body.append(dialog);
  dialog.showModal();
  const render = async () => {
    const { data: shares, error } = await supabase!
      .from("character_shares")
      .select("id,created_at")
      .eq("character_id", character.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    dialog.innerHTML = `<div class="dialog-heading"><h1>Share ${esc(character.name)}</h1><button data-close aria-label="Close sharing">✕</button></div><p>Anyone with a link and an account can view the latest saved version and save a copy.</p><button id="create-share" class="primary wide">Create share link</button><label id="share-url-label" hidden>Share link<input id="share-url" readonly><button id="copy-share" class="secondary">Copy link</button></label><div class="share-list">${(shares ?? []).map((share) => `<div><span>Created ${esc(new Date(share.created_at).toLocaleString())}</span><button class="secondary" data-revoke="${share.id}">Revoke</button></div>`).join("")}</div><p class="account-error" role="alert"></p>`;
    dialog
      .querySelector("[data-close]")!
      .addEventListener("click", () => dialog.close());
    dialog
      .querySelector("#create-share")!
      .addEventListener("click", async () => {
        const button =
          dialog.querySelector<HTMLButtonElement>("#create-share")!;
        button.disabled = true;
        try {
          const { data, error } = await supabase!
            .rpc("create_character_share", { p_character_id: character.id })
            .single();
          if (error) throw error;
          const url = new URL(location.href);
          url.hash = `/share/${(data as { token: string }).token}`;
          dialog.querySelector<HTMLInputElement>("#share-url")!.value =
            url.href;
          dialog.querySelector<HTMLElement>("#share-url-label")!.hidden = false;
          dialog
            .querySelector("#copy-share")!
            .addEventListener("click", async () => {
              await navigator.clipboard.writeText(url.href);
              dialog.querySelector("#copy-share")!.textContent = "Copied";
            });
          button.textContent = "Link created";
        } catch (error) {
          dialog.querySelector("[role=alert]")!.textContent =
            error instanceof Error ? error.message : String(error);
          button.disabled = false;
        }
      });
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-revoke]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          const { error } = await supabase!
            .from("character_shares")
            .delete()
            .eq("id", button.dataset.revoke!);
          if (error)
            dialog.querySelector("[role=alert]")!.textContent = error.message;
          else await render();
        }),
      );
  };
  dialog.addEventListener("close", () => dialog.remove());
  await render();
}
