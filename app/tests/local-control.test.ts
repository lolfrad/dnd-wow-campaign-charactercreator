import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizedShutdown,
  launcherHealth,
  localProjectId,
} from "../server/local-control";

test("health identifies this checkout and the actual HTTP server process", () => {
  const health = launcherHealth();
  assert.equal(health.app, "azeroth-token-forge");
  assert.equal(health.projectId, localProjectId);
  assert.match(health.projectId, /^[a-f0-9]{24}$/);
  assert.equal(health.pid, process.pid);
});
test("stopping requires the managed server secret and a correctly formed bearer token", () => {
  const original = process.env.FORGE_LAUNCHER_TOKEN;
  try {
    delete process.env.FORGE_LAUNCHER_TOKEN;
    assert.equal(authorizedShutdown("Bearer test-token"), false);
    process.env.FORGE_LAUNCHER_TOKEN = "launcher-test-token";
    assert.equal(authorizedShutdown(undefined), false);
    assert.equal(authorizedShutdown("Basic launcher-test-token"), false);
    assert.equal(authorizedShutdown("Bearer wrong-token"), false);
    assert.equal(authorizedShutdown("Bearer launcher-test-token"), true);
  } finally {
    if (original === undefined) delete process.env.FORGE_LAUNCHER_TOKEN;
    else process.env.FORGE_LAUNCHER_TOKEN = original;
  }
});
