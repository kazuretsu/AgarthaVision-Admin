import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests cover pure logic only — domain calculations, export column mapping,
 * and the provider registry. No test may require a live Supabase project.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Docs and hook commits legitimately touch no test file.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/adapters/registry.ts"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
