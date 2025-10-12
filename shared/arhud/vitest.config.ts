import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { defineConfig } = requireFromWeb("vitest/config");

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: rootDir,
    include: ["__tests__/**/*.spec.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@arhud": join(rootDir),
    },
  },
});
