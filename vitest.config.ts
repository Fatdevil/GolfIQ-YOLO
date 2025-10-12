import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/arhud/__tests__/**/*.spec.ts"],
    environment: "node",
    globals: true,
  },
});
