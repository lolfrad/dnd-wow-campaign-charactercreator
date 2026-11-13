import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentStore, type CloudCharacter } from "../src/document-store";
import type { CharacterConfig } from "../src/types";
import { normalizeUsername, usernameIdentity } from "../src/username";
const config = (name: string) =>
  ({ schemaVersion: 1, name }) as CharacterConfig;
const row = (name: string, revision = 1) =>
  ({
    id: "character-a",
    owner_id: "owner-a",
    config: config(name),
    name,
    revision,
    asset_snapshot: "test",
  }) as CloudCharacter;
test("usernames normalize to unique handles and never accept email addresses or paths", () => {
  assert.equal(
    usernameIdentity(" Alice_42 "),
    "alice_42@users.tokenforge.invalid",
  );
  for (const value of [
    "a",
    "User@site.test",
    "../admin",
    "hello world",
    "a".repeat(25),
    "<script>",
  ])
    assert.throws(() => normalizeUsername(value));
});
test("autosave serializes edits made during a request and uses the acknowledged revision", async () => {
  let release!: (value: CloudCharacter) => void;
  const calls: { name: string; revision: number | null }[] = [];
  const store = new DocumentStore(
    {
      async save(_id, revision, next) {
        calls.push({ name: next.name, revision });
        if (calls.length === 1)
          return new Promise((resolve) => (release = resolve));
        return row(next.name, 3);
      },
    },
    "test",
    () => {},
    100000,
  );
  store.bind(row("old"));
  store.change(config("first"));
  const pending = store.flush();
  assert.equal(store.state, "saving");
  assert.equal(store.dirty, true);
  store.change(config("latest"));
  release(row("first", 2));
  await pending;
  assert.deepEqual(calls, [
    { name: "first", revision: 1 },
    { name: "latest", revision: 2 },
  ]);
  assert.equal(store.document!.revision, 3);
  assert.equal(store.dirty, false);
  assert.equal(store.state, "saved");
  await store.flush();
});
test("failed writes retain dirty state and retry; conflicts require copying or loading a document", async () => {
  let mode = "network";
  let calls = 0;
  const store = new DocumentStore(
    {
      async save(_id, _revision, next) {
        calls++;
        if (mode === "network") throw new Error("offline");
        if (mode === "conflict")
          throw Object.assign(new Error("changed"), { code: "PT409" });
        return row(next.name, 2);
      },
    },
    "test",
    () => {},
    100000,
  );
  store.bind(row("old"));
  store.change(config("new"));
  await assert.rejects(store.flush(), /offline/);
  assert.equal(store.dirty, true);
  assert.equal(store.document!.revision, 1);
  mode = "ok";
  await store.flush();
  assert.equal(store.dirty, false);
  mode = "conflict";
  store.change(config("other"));
  await assert.rejects(store.flush());
  const before = calls;
  store.change(config("still other"));
  await assert.rejects(store.flush());
  assert.equal(calls, before);
  assert.equal(store.state, "conflict");
  store.bind(row("reloaded", 3));
  assert.equal(store.dirty, false);
  assert.equal(store.state, "saved");
});
test("shared documents never write and an empty name cannot be reported as saved", async () => {
  let calls = 0;
  const store = new DocumentStore(
    {
      async save() {
        calls++;
        return row("saved");
      },
    },
    "test",
    () => {},
    100000,
  );
  store.bind(row("shared"), true);
  store.change(config("hijack"));
  await store.flush();
  assert.equal(calls, 0);
  assert.equal(store.state, "readonly");
  store.bind(row("old"));
  store.change(config(""));
  await assert.rejects(store.flush(), /name/);
  assert.equal(calls, 0);
  assert.equal(store.dirty, true);
});
