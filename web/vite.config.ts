import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  test: {
    include: [
      "src/__tests__/**/*.spec.ts",
      "../shared/playslike/__tests__/**/*.spec.ts",
      "../shared/runs/__tests__/**/*.spec.ts",
    ],
  },
});
