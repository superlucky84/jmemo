import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"], ["junit", { outputFile: "reports/playwright-junit.xml" }]],
  webServer: {
    command: "node --env-file=.env server/index.mjs",
    url: "http://127.0.0.1:4100/health/live",
    timeout: 30_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      PORT: "4100",
      API_BASE_URL: "http://127.0.0.1:4100",
      JMEMO_USE_MEMORY_SERVICE: "1",
      MONGODB_URI: ""
    }
  }
});
