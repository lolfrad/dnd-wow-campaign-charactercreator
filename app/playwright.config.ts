import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    actionTimeout: 20000,
    baseURL: process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1050 },
    channel: "msedge",
    headless: true,
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
