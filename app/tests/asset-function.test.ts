import { test } from "node:test";
import assert from "node:assert/strict";
import { modelAssetHandler } from "../../supabase/functions/model-assets/handler";
const prefix =
  "https://example.supabase.co/functions/v1/model-assets/wow-assets/1794041972-ce4ceffb2208-v1/";
const headers = {
  authorization: "Bearer user-token",
  origin: "https://lolfrad.github.io",
};
test("asset function requires verified users, exact paths and allowed browser origins", async () => {
  let calls = 0;
  const handle = modelAssetHandler(
    async (token) => token === "user-token",
    async () => {
      calls++;
      return new Response("model bytes", {
        headers: { "Content-Type": "application/octet-stream" },
      });
    },
  );
  assert.equal(
    (await handle(new Request(prefix + "meta/npc/11121.json"))).status,
    401,
  );
  assert.equal(
    (
      await handle(
        new Request(prefix + "meta/npc/11121.json", {
          headers: { ...headers, origin: "https://other.test" },
        }),
      )
    ).status,
    403,
  );
  for (const path of [
    "meta/npc/11121.json?url=https://evil.test",
    "textures/../../secret",
    "https://evil.test/image.webp",
    "viewer/other.js",
    "meta/npc/nope.json",
  ])
    assert.equal(
      (await handle(new Request(prefix + path, { headers }))).status,
      400,
    );
  assert.equal(calls, 0);
  const preflight = await handle(
    new Request(prefix + "meta/npc/11121.json", {
      method: "OPTIONS",
      headers: { origin: headers.origin },
    }),
  );
  assert.equal(preflight.status, 204);
  const response = await handle(
    new Request(prefix + "view-7/q-high/meta/npc/11121.json", { headers }),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "model bytes");
  assert.equal(calls, 1);
});
