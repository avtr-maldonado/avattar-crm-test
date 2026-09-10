import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    setupFiles: ["tests/setup.ts"],
    // Las pruebas de integración comparten una sola base: correrlas en
    // paralelo produce interferencias difíciles de reproducir.
    fileParallelism: false,
    // El límite por omisión de 5 s alcanza para las pruebas puras, pero no para
    // las que cruzan a Supabase: medido desde México contra us-east-1, un
    // `select 1` cuesta 287 ms y el detalle de P-02, 1.7 s. Ver
    // docs/latencia.md antes de tomar estos números por lentitud del SQL.
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
