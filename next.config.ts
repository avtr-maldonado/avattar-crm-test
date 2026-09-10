import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Sin esto, Next infiere la raíz del workspace desde un package-lock.json
  // suelto en el directorio del usuario y avisa en cada arranque.
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // Habilita `forbidden()` y `unauthorized()`, que devuelven 403 y 401 de
    // verdad y renderizan forbidden.tsx / unauthorized.tsx.
    //
    // AC-02 lo pide explícitamente: «Un VENDEDOR que consulta /analisis recibe
    // 403», y aclara «no una pantalla vacía». Sin esta bandera, una pantalla de
    // «no tienes acceso» respondería 200, y una prueba que verifique el código
    // de estado —o un cliente de API— no notaría la diferencia.
    authInterrupts: true,
  },
};

export default nextConfig;
