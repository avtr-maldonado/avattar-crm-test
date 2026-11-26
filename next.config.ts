import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Sin esto, Next infiere la raíz del workspace desde un package-lock.json
  // suelto en el directorio del usuario y avisa en cada arranque.
  outputFileTracingRoot: path.join(__dirname),
  // La imagen de Docker (decisiones §70) usa el servidor standalone. Solo al
  // construirla: `pnpm dev` y el build local quedan como estaban.
  ...(process.env.BUILD_STANDALONE === "1"
    ? {
        output: "standalone" as const,
        // El motor de Prisma se carga por ruta, no por import, y el trazado de
        // Next a veces lo deja fuera del standalone.
        outputFileTracingIncludes: { "/**": ["./node_modules/.prisma/client/**/*"] },
      }
    : {}),
  experimental: {
    // Habilita `forbidden()` y `unauthorized()`, que devuelven 403 y 401 de
    // verdad y renderizan forbidden.tsx / unauthorized.tsx.
    //
    // AC-02 lo pide explícitamente: «Un VENDEDOR que consulta /analisis recibe
    // 403», y aclara «no una pantalla vacía». Sin esta bandera, una pantalla de
    // «no tienes acceso» respondería 200, y una prueba que verifique el código
    // de estado —o un cliente de API— no notaría la diferencia.
    authInterrupts: true,
    // Un documento viaja en el FormData de una Server Action (lib/domain/document.ts, tope de
    // 25 MB). Por omisión Next corta las acciones en 1 MB y lo que pasa por el middleware en 10 MB:
    // todo documento de más de 1 MB fallaba. 26 MB = el archivo más el resto del formulario (§70;
    // lo vigila tests/arquitectura/limites.test.ts).
    serverActions: { bodySizeLimit: "26mb" },
    middlewareClientMaxBodySize: "26mb",
  },
};

export default nextConfig;
