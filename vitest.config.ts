import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/.claude/**", "**/node_modules/**"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
