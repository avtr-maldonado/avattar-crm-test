import { forbidden } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Boton, EstadoVacio } from "@/components/ui/primitivas";

/**
 * P-09 · Análisis.
 *
 * **Denegado a `VENDEDOR`** · AC-02: «Un VENDEDOR que consulta /analisis recibe
 * 403», y el spec aclara «no una pantalla vacía». Por eso `forbidden()` y no un
 * mensaje con estatus 200: la diferencia importa para una prueba automatizada y
 * para cualquier cliente que no sea un navegador.
 *
 * Los tableros llegan con E4. La ruta existe desde ahora porque la
 * autorización es lo que E0 tenía que garantizar, y una regla que no se puede
 * ejercer no está probada.
 *
 * §11 · los indicadores que requieren historia mostrarán «sin datos
 * suficientes» durante los primeros trimestres, **nunca un cero** (C-02).
 */
export default async function AnalisisPage() {
  const session = await requireSession();

  if (!can(session, "VER_ANALISIS")) forbidden();

  return (
    <>
      <BarraSuperior
        titulo="Análisis"
        subtitulo="Dirección · Rentabilidad · Facturación esperada"
        usuario={{
          nombre: session.name,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EstadoVacio
          titulo="Los tableros llegan con el incremento de medición"
          explicacion="Ingreso y utilidad contra objetivo, rentabilidad por familia y facturación esperada por hitos. Varios dependen de historia que este sistema todavía no tiene: arrancó en limpio, sin migrar Pipedrive, así que mostrarán «sin datos suficientes» y no un cero durante los primeros trimestres."
          accion={
            <>
              <Boton href="/objetivos" variante="secundario">
                Ver objetivos
              </Boton>
              <Boton href="/oportunidades">Ir al pipeline</Boton>
            </>
          }
        />
      </div>
    </>
  );
}
