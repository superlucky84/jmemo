import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.*", "tests/smoke/**/*.test.*", "tests/integration/**/*.test.*"],
    exclude: ["tests/e2e/**"]
  }
});
