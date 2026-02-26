import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      all: true,
      include: ["src/ts/**/*.ts"],
      exclude: [
        "tests/**/*.test.ts",
        "src/ts/test/**",
        "src/ts/types.ts",
        "src/ts/adapters/types.ts",
        "src/ts/config/types.ts",
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
