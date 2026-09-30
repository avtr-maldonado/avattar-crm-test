import { forbidden } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getCommercialPolicy, getCountry } from "@/lib/policy";
import { destinatariosValidos } from "@/lib/domain/opportunity";
import {
  abiertasDelAnalisis,
  actividadesHechasDelAnio,
  ganadas,
  objetivosDelAnalisis,
} from "@/lib/scope/analisis";
import { hrefDeAnalisis, parseFiltrosDeAnalisis, type PestanaDeAnalisis } from "@/lib/filters/analisis";
import { rangoDeAnioFiscal, trimestreDe } from "@/lib/filters";
import { iniciales, NOMBRE_PAIS } from "@/lib/etiquetas";
import type { CountryCode } from "@/lib/dto";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { ControlSegmentado } from "@/components/ui/primitivas";
import { FiltrosDeAnalisis } from "@/components/analisis/FiltrosDeAnalisis";
import { PestanaVentas } from "@/components/analisis/PestanaVentas";
import { PestanaForecast } from "@/components/analisis/PestanaForecast";
import { PestanaActividad } from "@/components/analisis/PestanaActividad";

/**
 * P-09 · Análisis.
 *
 * **Denegado a `VENDEDOR`** · AC-02: «Un VENDEDOR que consulta /analisis recibe
 * 403», y el spec aclara «no una pantalla vacía». Por eso `forbidden()` y no un
 * mensaje con estatus 200: la diferencia importa para una prueba automatizada y
 * para cualquier cliente que no sea un navegador.
 *
 * Tres pestañas, ocho reportes (decisiones §28): A · análisis de ventas (1 a 3),
 * B · forecast (4 a 6), C · actividad y MEDDIC (8 y 9). Todo el estado —pestaña,
 * filtros, agrupación de cada reporte— vive en la URL (INV-10): un reporte es
 * un enlace que se puede pegar en un correo y abre igual.
 *
 * ## Alcance y filtros
 *
 * Los lectores de `lib/scope/analisis` ponen primero el alcance del rol y
 * después los filtros, con AND: un gerente que pide «CO» sin operar en CO no
 * ve nada (AC-25). La oficina activa de la barra no recorta aquí: esta pantalla
 * es para comparar países, y el país es un filtro explícito.
 *
 * ## Qué fecha manda
 *
 * Cada reporte lo dice bajo su título (§9): ventas y ciclo por cierre real,
 * embudo por cierre estimado, antigüedad y MEDDIC medidos hoy, actividad por
 * fecha en que se hizo. El histórico (2) ignora el filtro de año a propósito.
 *
 * ## Sin datos suficientes
 *
 * §11 · los indicadores que requieren historia dicen «sin datos suficientes»
 * durante los primeros trimestres, **nunca un cero** (C-02). Las funciones de
 * dominio devuelven promedios nulos y aquí se redactan.
 */
const PESTANAS: readonly { valor: PestanaDeAnalisis; etiqueta: string }[] = [
  { valor: "ventas", etiqueta: "Análisis de ventas" },
  { valor: "forecast", etiqueta: "Forecast" },
  { valor: "actividad", etiqueta: "Actividad y MEDDIC" },
];

/** Lo que no es filtro y aun así vive en la URL: se conserva al cambiar un filtro. */
export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([requireSession(), searchParams]);

  if (!can(session, "VER_ANALISIS")) forbidden();

  const sp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    for (const uno of Array.isArray(valor) ? valor : valor ? [valor] : []) sp.append(clave, uno);
  }

  const ahora = new Date();

  // El calendario fiscal es del país filtrado o, sin filtro, del primero del
  // alcance. Hace falta antes de leer los filtros, porque el año por omisión
  // es el fiscal en curso y ese depende del país.
  const paisesPedidos = new Set(sp.getAll("pais"));
  const paisDeCalendario: CountryCode =
    session.countryCodes.find((c) => paisesPedidos.has(c)) ?? session.countryCodes[0]!;
  const [calendario, politica] = await Promise.all([
    getCountry(paisDeCalendario),
    getCommercialPolicy(paisDeCalendario),
  ]);
  const { fiscalYearStartMonth } = calendario;
  const enCurso = trimestreDe(ahora, fiscalYearStartMonth);
  const filtros = parseFiltrosDeAnalisis(sp, session, { anioActual: enCurso.fiscalYear });

  const recorte = {
    pais: filtros.pais,
    vendedor: filtros.vendedor,
  };
  const anioFiscal = { fiscalYear: filtros.anio, fiscalYearStartMonth };
  const verCosto = can(session, "VER_COSTO");

  // Cada pestaña lee solo lo suyo, y todo lo suyo a la vez.
  const cargarPestana = async () => {
    switch (filtros.pestana) {
      case "ventas": {
        const [historico, cuotas] = await Promise.all([
          ganadas(session, recorte, null),
          objetivosDelAnalisis(session, {
            fiscalYear: filtros.anio,
            paises: filtros.pais.length > 0 ? filtros.pais : session.countryCodes,
            fiscalYearStartMonth,
            vendedor: filtros.vendedor,
          }),
        ]);
        const rango = rangoDeAnioFiscal(filtros.anio, fiscalYearStartMonth);
        return {
          pestana: "ventas" as const,
          historico,
          ventasDelAnio: historico.filter((v) => v.actualCloseDate >= rango.from && v.actualCloseDate <= rango.to),
          cuotas,
        };
      }
      case "forecast": {
        const [abiertas, ventasDelAnio] = await Promise.all([
          abiertasDelAnalisis(session, recorte),
          ganadas(session, recorte, anioFiscal),
        ]);
        return { pestana: "forecast" as const, abiertas, ventasDelAnio };
      }
      case "actividad": {
        const [actividades, abiertas] = await Promise.all([
          actividadesHechasDelAnio(session, { pais: filtros.pais, vendedor: filtros.vendedor }, anioFiscal),
          abiertasDelAnalisis(session, recorte),
        ]);
        return { pestana: "actividad" as const, actividades, abiertas };
      }
    }
  };

  const [vendedores, datos] = await Promise.all([
    // El catálogo de vendedores se acota al país filtrado cuando es uno; con un
    // solo país en el alcance, a ese. Dirección sin filtro ve a todos.
    destinatariosValidos(
      filtros.pais.length === 1
        ? filtros.pais[0]
        : session.countryCodes.length === 1
          ? session.countryCodes[0]
          : null,
    ),
    cargarPestana(),
  ]);

  const hrefDe = (cambios: Record<string, string | readonly string[] | null>) => hrefDeAnalisis(sp, cambios);

  const vendedoresElegidos = new Set(filtros.vendedor);
  const vendedoresFiltrados = vendedores.flatMap((v) => (vendedoresElegidos.has(v.id) ? [v.name] : []));
  const subtitulo = [
    filtros.pais.length === 0
      ? "Todos los países del alcance"
      : filtros.pais.map((c) => NOMBRE_PAIS[c]).join(", "),
    `año fiscal ${filtros.anio}`,
    vendedoresFiltrados.length === 0
      ? null
      : vendedoresFiltrados.length <= 2
        ? vendedoresFiltrados.join(" y ")
        : `${vendedoresFiltrados.length} vendedores`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <BarraSuperior
        titulo="Análisis"
        subtitulo={subtitulo}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ControlSegmentado opciones={PESTANAS} activa={filtros.pestana} hrefDe={(v) => hrefDe({ p: v })} />

        <div className="mt-4 rounded-md border border-borde bg-superficie-tarjeta px-4 py-3">
          <FiltrosDeAnalisis
            activos={{
              pais: filtros.pais,
              vendedor: filtros.vendedor,
              anio: filtros.anio,
            }}
            catalogos={{
              paises: session.countryCodes.map((c) => ({ valor: c, etiqueta: NOMBRE_PAIS[c] })),
              vendedores: vendedores.map((v) => ({ valor: v.id, etiqueta: v.name })),
              // El año en curso y dos atrás, más el pedido en la URL si es otro.
              anios: [...new Set([enCurso.fiscalYear, enCurso.fiscalYear - 1, enCurso.fiscalYear - 2, filtros.anio])].sort(
                (a, b) => b - a,
              ),
            }}
          />
        </div>

        <div className="mt-6 space-y-6">
          {datos.pestana === "ventas" ? (
            <PestanaVentas
              ventasDelAnio={datos.ventasDelAnio}
              historico={datos.historico}
              cuotas={datos.cuotas}
              filtros={filtros}
              fiscalYearStartMonth={fiscalYearStartMonth}
              trimestreEnCurso={enCurso}
              verCosto={verCosto}
            />
          ) : datos.pestana === "forecast" ? (
            <PestanaForecast
              abiertas={datos.abiertas}
              ventasDelAnio={datos.ventasDelAnio}
              filtros={filtros}
              hrefDe={hrefDe}
              fiscalYearStartMonth={fiscalYearStartMonth}
              ahora={ahora}
            />
          ) : (
            <PestanaActividad
              actividades={datos.actividades}
              abiertas={datos.abiertas}
              ahora={ahora}
              minimoCierre={politica.meddicMinToClosing}
              anio={filtros.anio}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          )}
        </div>
      </div>
    </>
  );
}
