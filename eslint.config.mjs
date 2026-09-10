import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * INV-01 · La frontera de datos.
 *
 * `lib/db` y `@prisma/client` son inalcanzables desde `app/**` y `components/**`.
 * Esas capas reciben funciones ya acotadas de `lib/scope` y `lib/domain`, nunca
 * un cliente con el que puedan consultar por su cuenta.
 *
 * Esta es la mitad de AC-32. La otra mitad es tests/arquitectura/invariantes.test.ts,
 * que además atrapa el uso directo de `prisma.<modelo>.findMany` aunque el import
 * venga por una ruta que este patrón no cubra.
 */
const fronteraDeDatos = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@/lib/db", "**/lib/db"],
          message:
            "INV-01: solo lib/scope y lib/domain pueden importar el cliente Prisma. Usa una función de lib/scope.",
        },
        {
          group: ["@prisma/client"],
          message:
            "INV-01: no importes tipos de Prisma en la UI. Usa los DTO de lib/dto, que ya excluyen el costo (INV-02).",
        },
      ],
    },
  ],
};

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".agents/**",
      ".claude/**",
      "docs/**",
      "supabase/migrations/_archivo_v1/**",
      "prisma/generated/**",
      "next-env.d.ts", // generado por Next en cada build
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // middleware.ts entra aqui aunque no sea UI: corre en el runtime Edge,
    // donde Prisma no funciona, y es un lugar tentador para colar una
    // consulta "rapida" de autorizacion que deberia vivir en lib/scope.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "middleware.ts"],
    rules: fronteraDeDatos,
  },
];

export default config;
