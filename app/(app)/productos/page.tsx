import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listProductos, listVigenciasDePrecio } from "@/lib/scope/productos";
import { familiasDeProducto } from "@/lib/scope/configuracion";
import { getCommercialPolicy } from "@/lib/policy";
import { EditarProducto } from "@/components/productos/EditarProducto";
import { crearProductoAccion, editarProductoAccion } from "./acciones";
import { formatPercent, formatUSD, money, toClient } from "@/lib/money";
import { iniciales } from "@/lib/etiquetas";
import { BarraSuperior } from "@/components/ui/BarraSuperior";
import { Pastilla, StatTile } from "@/components/ui/primitivas";
import { Pestanas, type Pestana } from "@/components/oportunidad/Pestanas";

/**
 * P-06 · Productos.
 *
 * «Pestañas Catálogo y Listas de precio. Columnas de costo y margen presentes
 * solo con `VER_COSTO` (INV-02). Muestra `costUpdatedAt` y marca en ámbar los
 * SKU con costo de más de 60 días (C-01).»
 *
 * ## Sin VER_COSTO no sale el margen, aunque RN-09 los separe
 *
 * En la cotización el margen sin costo tiene sentido: el vendedor lo necesita
 * para negociar. En un catálogo no: con el precio de lista a la vista,
 * `costo = precio × (1 − margen)` recupera el costo **exacto**. Con 18 000 y
 * 47.2 % salen 9 500 clavados.
 *
 * Es la misma aritmética que hacía inútil la vista «sin costo» del esquema
 * archivado. Lo que el vendedor sí ve es `minPrice`, el piso duro de RN-08, que
 * es lo que de verdad necesita para saber hasta dónde puede bajar.
 *
 * ## La antigüedad del costo es el riesgo C-01 hecho visible
 *
 * Sin la integración con Defontana el costo estándar se mantiene a mano. Un
 * costo de hace siete meses hace que el margen mienta, y con él la autorización
 * que ese margen dispara —o deja de disparar—. Por eso la columna existe.
 */
const DIAS_COSTO_OBSOLETO = 60;

const PESTANAS: Pestana[] = [
  { clave: "catalogo", etiqueta: "Catálogo" },
  { clave: "listas", etiqueta: "Lista de precio" },
];

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const activa = sp.p === "listas" ? "listas" : "catalogo";
  const verCosto = can(session, "VER_COSTO");
  // Productos son catálogo: los edita quien edita catálogos, igual que en P-11.
  const puedeEditar = can(session, "EDITAR_CATALOGOS");

  const [productos, vigencias, familias, politica] = await Promise.all([
    listProductos(session),
    listVigenciasDePrecio(session),
    puedeEditar ? familiasDeProducto() : Promise.resolve([]),
    // La lista es única en USD; el piso de margen por línea se toma de México,
    // como hace el seed. Ver `app/(app)/productos/acciones.ts`.
    getCommercialPolicy("MX"),
  ]);
  const pisoDeMargen = Number(politica.lineMarginFloor);
  const ahora = new Date();

  const obsoletos = verCosto
    ? productos.filter((p) => diasDesde(costoActualizado(p), ahora) > DIAS_COSTO_OBSOLETO)
    : [];

  return (
    <>
      <BarraSuperior
        titulo="Productos"
        subtitulo={`${productos.length} SKU activos · lista única en USD para los tres países`}
        usuario={{
          nombre: session.name,
          correo: session.email,
          iniciales: iniciales(session.name),
          rol: session.role,
          paises: session.countryCodes,
        }}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            etiqueta="SKU activos"
            valor={String(productos.length)}
            subtexto="en el catálogo"
          />
          <StatTile
            etiqueta="Familias"
            valor={String(new Set(productos.map((p) => p.family.name)).size)}
            subtexto="agrupan el análisis de rentabilidad"
          />
          <StatTile
            etiqueta="Con precio vigente"
            valor={String(productos.filter((p) => p.prices.length > 0).length)}
            subtexto="a la fecha de hoy"
            tono="acento"
          />
          {verCosto ? (
            <StatTile
              etiqueta="Costo desactualizado"
              valor={String(obsoletos.length)}
              subtexto={`más de ${DIAS_COSTO_OBSOLETO} días`}
              tono={obsoletos.length > 0 ? "peligro" : "exito"}
            />
          ) : (
            <StatTile
              etiqueta="Piso de precio"
              valor="por SKU"
              subtexto="hasta ahí puedes descontar (RN-08)"
            />
          )}
        </div>

        {verCosto && obsoletos.length > 0 && (
          <div className="mt-4 rounded-md border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
            <p className="font-medium text-texto-titulo">
              {obsoletos.length} de {productos.length} SKU tienen el costo sin actualizar
            </p>
            <p className="mt-1 text-texto-cuerpo">
              El costo estándar se mantiene a mano mientras la integración con
              Defontana esté fuera de alcance. Un costo viejo hace que el margen
              mienta, y con él la autorización que ese margen dispara.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <Pestanas
            pestanas={PESTANAS}
            activa={activa}
            hrefDe={(clave) => `/productos?p=${clave}`}
          />
          {puedeEditar && (
            <EditarProducto
              familias={familias}
              pisoDeMargen={pisoDeMargen}
              puedeVerCosto={verCosto}
              accion={crearProductoAccion}
            />
          )}
        </div>

        <div className="mt-6">
          {activa === "listas" ? (
            <TabListas vigencias={vigencias} verCosto={verCosto} ahora={ahora} />
          ) : (
            <TabCatalogo
              productos={productos}
              verCosto={verCosto}
              ahora={ahora}
              edicion={
                puedeEditar
                  ? { familias, pisoDeMargen, accion: editarProductoAccion }
                  : null
              }
            />
          )}
        </div>

        {!verCosto && (
          <p className="mt-6 max-w-2xl text-xs text-texto-tenue">
            Tu rol no incluye ver el costo, así que esta pantalla tampoco muestra el
            margen: con el precio a la vista, el margen permitiría calcular el costo
            exacto. El precio mínimo es el piso hasta el que puedes descontar.
          </p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Catálogo

function TabCatalogo({
  productos,
  verCosto,
  ahora,
  edicion,
}: {
  productos: Awaited<ReturnType<typeof listProductos>>;
  verCosto: boolean;
  ahora: Date;
  /** Nulo cuando la sesión no edita catálogos: la columna no aparece. */
  edicion: {
    familias: { id: string; name: string }[];
    pisoDeMargen: number;
    accion: typeof editarProductoAccion;
  } | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-borde">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-superficie-sutil">
          <tr className="text-left">
            <Th>SKU</Th>
            <Th>Producto</Th>
            <Th>Familia</Th>
            <Th>Modelo de precio</Th>
            <Th alineacion="derecha">Precio de lista</Th>
            <Th alineacion="derecha">Precio mínimo</Th>
            {verCosto && <Th alineacion="derecha">Costo estándar</Th>}
            {verCosto && <Th alineacion="derecha">Margen</Th>}
            {verCosto && <Th alineacion="derecha">Costo actualizado</Th>}
            {edicion && <Th alineacion="derecha">&nbsp;</Th>}
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => {
            const precio = p.prices[0];
            const dias = verCosto ? diasDesde(costoActualizado(p), ahora) : 0;
            const obsoleto = dias > DIAS_COSTO_OBSOLETO;

            return (
              <tr key={p.id} className="border-t border-borde hover:bg-superficie-sutil">
                <td className="px-3 py-2.5 font-mono text-xs text-texto-tenue">{p.sku}</td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-texto-titulo">{p.name}</p>
                  <p className="text-xs text-texto-tenue">por {p.unit}</p>
                </td>
                <td className="px-3 py-2.5 text-texto-cuerpo">{p.family.name}</td>
                <td className="px-3 py-2.5">
                  <Pastilla>{ETIQUETA_MODELO[p.priceModel]}</Pastilla>
                </td>
                <td className="tabular px-3 py-2.5 text-right font-medium">
                  {precio ? formatUSD(precio.listPrice) : <SinPrecio />}
                </td>
                <td
                  className="tabular px-3 py-2.5 text-right text-texto-cuerpo"
                  title="RN-08 · piso duro. Un descuento que baje de aquí no se guarda."
                >
                  {precio ? formatUSD(precio.minPrice) : <SinPrecio />}
                </td>

                {verCosto && (
                  <td className="tabular px-3 py-2.5 text-right">
                    {precio && "standardCost" in precio ? (
                      formatUSD(precio.standardCost)
                    ) : (
                      <SinPrecio />
                    )}
                  </td>
                )}
                {verCosto && (
                  <td className="tabular px-3 py-2.5 text-right">
                    <MargenDeLista precio={precio} obsoleto={obsoleto} />
                  </td>
                )}
                {verCosto && (
                  <td className="tabular px-3 py-2.5 text-right">
                    <Antiguedad dias={dias} obsoleto={obsoleto} />
                  </td>
                )}
                {edicion && (
                  <td className="px-3 py-2.5 text-right">
                    <EditarProducto
                      producto={{
                        id: p.id,
                        sku: p.sku,
                        name: p.name,
                        description: p.description,
                        familyId: p.family.id,
                        unit: p.unit,
                        priceModel: p.priceModel,
                        active: p.active,
                        listPrice: precio ? toClient(precio.listPrice) : "",
                        standardCost:
                          precio && "standardCost" in precio ? toClient(precio.standardCost) : null,
                      }}
                      familias={edicion.familias}
                      pisoDeMargen={edicion.pisoDeMargen}
                      puedeVerCosto={verCosto}
                      accion={edicion.accion}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El margen que da la lista: `(precio − costo) ÷ precio`.
 *
 * Se calcula aquí y no se guarda, porque es derivado de dos columnas que sí se
 * guardan. Cuando el costo está viejo, el número se atenúa: sigue siendo cierto
 * aritméticamente y deja de serlo como información.
 */
function MargenDeLista({
  precio,
  obsoleto,
}: {
  precio: { listPrice: unknown; standardCost?: unknown } | undefined;
  obsoleto: boolean;
}) {
  if (!precio || !("standardCost" in precio) || precio.standardCost === undefined) {
    return <SinPrecio />;
  }

  const lista = money(String(precio.listPrice));
  const costo = money(String(precio.standardCost));
  if (lista.isZero()) return <SinPrecio />;

  const margen = lista.minus(costo).div(lista);

  return (
    <span
      className={obsoleto ? "text-texto-tenue" : "text-texto-cuerpo"}
      title={obsoleto ? "Calculado sobre un costo desactualizado" : undefined}
    >
      {formatPercent(toClient(margen))}
    </span>
  );
}

function Antiguedad({ dias, obsoleto }: { dias: number; obsoleto: boolean }) {
  return (
    <span
      className={obsoleto ? "font-medium text-coral" : "text-texto-cuerpo"}
      title={
        obsoleto
          ? `Sin actualizar en ${dias} días. C-01: sin Defontana, el costo se mantiene a mano.`
          : undefined
      }
    >
      hace {dias} d
    </span>
  );
}

// ─────────────────────────────────────────────────────── Lista de precio

function TabListas({
  vigencias,
  verCosto,
  ahora,
}: {
  vigencias: Awaited<ReturnType<typeof listVigenciasDePrecio>>;
  verCosto: boolean;
  ahora: Date;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-borde bg-superficie-tarjeta p-5">
        <h2 className="text-sm font-semibold text-texto-titulo">
          Lista única en USD para México, Colombia y Chile
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-texto-cuerpo">
          No hay lista por país ni por moneda: la operación de Avattar en los tres
          países cotiza en dólares. Está registrada como decisión D-A.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-texto-tenue">
          RN-26 · se cotiza con la vigencia del día. Cambiar una lista no altera
          cotizaciones ya congeladas, porque la cotización copia precio y costo a
          la línea al crearse. Por eso ver el histórico de vigencias es lo que
          permite explicar de dónde salió el precio de una cotización vieja.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-borde">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-superficie-sutil">
            <tr className="text-left">
              <Th>SKU</Th>
              <Th>Producto</Th>
              <Th alineacion="derecha">Precio de lista</Th>
              <Th alineacion="derecha">Precio mínimo</Th>
              {verCosto && <Th alineacion="derecha">Costo estándar</Th>}
              <Th alineacion="derecha">Vigencia</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {vigencias.map((v) => {
              const vigente = v.validFrom <= ahora && v.validTo >= ahora;
              return (
                <tr key={v.id} className="border-t border-borde hover:bg-superficie-sutil">
                  <td className="px-3 py-2.5 font-mono text-xs text-texto-tenue">
                    {v.product.sku}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-texto-titulo">{v.product.name}</p>
                    <p className="text-xs text-texto-tenue">
                      {v.product.family.name} · por {v.product.unit}
                    </p>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium">
                    {formatUSD(v.listPrice)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-texto-cuerpo">
                    {formatUSD(v.minPrice)}
                  </td>
                  {verCosto && (
                    <td className="tabular px-3 py-2.5 text-right">
                      {"standardCost" in v ? formatUSD(v.standardCost) : <SinPrecio />}
                    </td>
                  )}
                  <td className="tabular px-3 py-2.5 text-right text-xs text-texto-tenue">
                    {FECHA.format(v.validFrom)} — {FECHA.format(v.validTo)}
                  </td>
                  <td className="px-3 py-2.5">
                    {vigente ? (
                      <Pastilla tono="exito">Vigente</Pastilla>
                    ) : v.validTo < ahora ? (
                      <Pastilla>Vencida</Pastilla>
                    ) : (
                      <Pastilla tono="acento">Futura</Pastilla>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Auxiliares

function SinPrecio() {
  return (
    <span className="text-texto-tenue" title="Sin precio vigente a la fecha de hoy">
      —
    </span>
  );
}

function costoActualizado(p: { costUpdatedAt?: Date | null }): Date | null {
  return p.costUpdatedAt ?? null;
}

function diasDesde(fecha: Date | null, ahora: Date): number {
  if (fecha === null) return Number.POSITIVE_INFINITY;
  return Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
}

function Th({
  children,
  alineacion = "izquierda",
}: {
  children: React.ReactNode;
  alineacion?: "izquierda" | "derecha";
}) {
  return (
    <th
      className={`eyebrow px-3 py-2 font-medium ${alineacion === "derecha" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const ETIQUETA_MODELO: Record<string, string> = {
  PRECIO_FIJO: "Precio fijo",
  TIEMPO_Y_MATERIALES: "Tiempo y materiales",
  RECURRENTE: "Recurrente",
  RECURRENTE_ANUAL: "Recurrente anual",
  POR_CONSUMO: "Por consumo",
};
