import Link from "next/link";
import clsx from "clsx";
import type { CountryCode, LeadStage } from "@/lib/dto";
import type { ResultadoAccion } from "@/lib/acciones";
import { estadoDeAgenda, type RelojDeAgenda } from "@/lib/domain/agenda";
import { ETIQUETA_DE_ETAPA } from "@/lib/domain/leadStages";
import { Boton, ControlSegmentado } from "@/components/ui/primitivas";
import { Icono } from "@/components/ui/iconos";
import { PastillaDeEstado, TranscripcionPlegada } from "@/components/actividades/comun";
import { ComposerDeActividad, type ActividadEditable, type SincroniaDeCalendario, type TipoDeActividad } from "@/components/oportunidad/ComposerDeActividad";
import { AccionesDeProspecto } from "./AccionesDeProspecto";
import type { VendedorAsignable } from "./AsignarProspectos";
import type { MotivoDeDescarte } from "./DescartarProspecto";
import { PastillaDeEtapa, PastillaDeSla, Puntaje } from "./PastillaDeEtapa";
import { formateadoresDe, type DatosDeProspecto } from "./formato";

export type PestanaDeDetalle = "actividades" | "informacion" | "historia";

const PESTANAS = [
  { valor: "actividades", etiqueta: "Actividades" },
  { valor: "informacion", etiqueta: "Información" },
  { valor: "historia", etiqueta: "Historia" },
] as const;

export type ActividadDeProspecto = {
  id: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  transcript: string | null;
  startsAt: Date;
  durationMin: number | null;
  completedAt: Date | null;
  externalEventId: string | null;
  type: { id: string; name: string };
  user: { id: string; name: string; initials: string };
};

export type EventoDeHistoria = { id: string; cuando: Date; quien: string; texto: string };

type ResultadoDeActividad = ResultadoAccion<{ id: string; siguienteEn: Date | null; calendario: SincroniaDeCalendario }>;
type AccionDeActividad = (previo: ResultadoDeActividad | null, form: FormData) => Promise<ResultadoDeActividad>;

/**
 * El panel lateral del prospecto · decisiones §58. Abierto desde la URL
 * (`p=<id>`), así que se comparte y sobrevive a recargar. Arriba quién es y de
 * dónde vino; en medio tres pestañas (actividades, información, historia); al
 * pie las acciones, solo las que esta sesión puede hacer.
 */
export function DetalleDeProspecto({
  datos,
  detalle,
  pestana,
  hrefDePestana,
  zona,
  reloj,
  actividades,
  historia,
  etapasPosibles,
  vendedores,
  motivos,
  composer,
  convertir,
  editar,
  acciones,
}: {
  datos: DatosDeProspecto;
  detalle: {
    cargo: string | null;
    giro: string | null;
    notas: string | null;
    captadoPor: string;
    etapa: LeadStage;
    countryCode: CountryCode;
    convertido: { opportunityId: string; folio: string; nombre: string } | null;
    motivoDeDescarte: string | null;
  };
  pestana: PestanaDeDetalle;
  hrefDePestana: (p: PestanaDeDetalle) => string;
  zona: string;
  reloj: RelojDeAgenda;
  actividades: ActividadDeProspecto[];
  historia: EventoDeHistoria[];
  etapasPosibles: LeadStage[];
  vendedores: VendedorAsignable[];
  motivos: MotivoDeDescarte[];
  /** Lo que el composer necesita; `null` cuando la sesión no registra actividades aquí. */
  composer: { tipos: TipoDeActividad[]; usuarios: { id: string; name: string }[]; usuarioActual: string; zonaEtiqueta: string; accion: AccionDeActividad } | null;
  /** El botón y el panel de convertir, cuando esta sesión puede (§58). */
  convertir?: React.ReactNode;
  /** El botón y el panel de editar los datos, para quien gestiona. */
  editar?: React.ReactNode;
  acciones: React.ComponentProps<typeof AccionesDeProspecto>["acciones"];
}) {
  const { fecha, hora, fechaLarga } = formateadoresDe(zona);

  const nueva = composer ? <ComposerDeActividad leadId={datos.id} {...composer} zona={zona} /> : null;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <Dato etiqueta="Correo" valor={datos.correo ?? "—"} />
        <Dato etiqueta="Teléfono" valor={datos.telefono ?? "—"} />
        <Dato etiqueta="Cargo" valor={detalle.cargo ?? "—"} />
        <Dato etiqueta="Canal" valor={datos.canal} />
        <Dato etiqueta="Campaña" valor={datos.campana ?? "—"} />
        <div>
          <dt className="eyebrow">Etapa</dt>
          <dd className="mt-1">
            <PastillaDeEtapa etapa={datos.etapa} />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Puntaje</dt>
          <dd className="mt-1">
            <Puntaje valor={datos.score} />
          </dd>
        </div>
        <Dato etiqueta="Vendedor" valor={datos.vendedor?.nombre ?? "Sin asignar"} />
        <div>
          <dt className="eyebrow">Primer contacto</dt>
          <dd className="mt-1">
            <PastillaDeSla estado={datos.sla} />
          </dd>
        </div>
        {detalle.convertido && (
          <div className="col-span-2">
            <dt className="eyebrow">Oportunidad</dt>
            <dd className="mt-0.5">
              <Link href={`/oportunidades/${detalle.convertido.opportunityId}`} className="font-medium text-acento hover:underline">
                {detalle.convertido.folio} · {detalle.convertido.nombre}
              </Link>
            </dd>
          </div>
        )}
        {detalle.motivoDeDescarte && <Dato etiqueta="Motivo de descarte" valor={detalle.motivoDeDescarte} />}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ControlSegmentado opciones={PESTANAS} activa={pestana} hrefDe={(p) => hrefDePestana(p)} />
        {editar}
      </div>

      <div>
        {pestana === "actividades" && (
          <div className="space-y-3">
            {nueva && <div className="flex justify-end">{nueva}</div>}
            {actividades.length === 0 ? (
              <p className="rounded-sm border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-tenue">Sin actividades todavía.</p>
            ) : (
              <ol className="divide-y divide-borde">
                {actividades.map((a) => {
                  const estado = estadoDeAgenda(a, reloj);
                  const editable: ActividadEditable = {
                    id: a.id,
                    typeId: a.type.id,
                    subject: a.subject,
                    notes: a.notes,
                    outcome: a.outcome,
                    transcript: a.transcript,
                    startsAt: a.startsAt.toISOString(),
                    durationMin: a.durationMin,
                    hecha: a.completedAt != null,
                    userId: a.user.id,
                    enCalendario: a.externalEventId != null,
                  };
                  return (
                    <li key={a.id} className="flex items-start gap-3 py-2.5">
                      <span className={clsx("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-pill", estado === "realizada" ? "bg-exito/10 text-exito" : "bg-superficie-sutil text-texto-tenue")}>
                        <Icono nombre={estado === "realizada" ? "palomita" : "reloj"} className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={clsx("text-sm font-medium", estado === "realizada" ? "text-texto-tenue" : "text-texto-titulo")}>{a.subject}</p>
                          <PastillaDeEstado estado={estado} />
                        </div>
                        {(a.outcome ?? a.notes) && <p className="mt-0.5 text-xs text-texto-cuerpo">{a.outcome ?? a.notes}</p>}
                        <TranscripcionPlegada texto={a.transcript} className="mt-0.5" />
                        <p className="tabular mt-0.5 text-xs text-texto-tenue">
                          {a.type.name} · {fecha.format(a.startsAt)}, {hora.format(a.startsAt)} · {a.user.name}
                        </p>
                      </div>
                      {composer && <ComposerDeActividad leadId={datos.id} {...composer} zona={zona} actividad={editable} />}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {pestana === "informacion" && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Dato etiqueta="Folio" valor={datos.folio} mono />
            <Dato etiqueta="Giro" valor={detalle.giro ?? "—"} />
            <Dato etiqueta="Ingreso" valor={datos.ingreso} />
            <Dato etiqueta="Captado por" valor={detalle.captadoPor} />
            <Dato etiqueta="País" valor={detalle.countryCode} />
            <Dato etiqueta="Días en el pipeline" valor={String(datos.dias)} />
            <div className="col-span-2">
              <dt className="eyebrow">Notas</dt>
              <dd className="mt-0.5 whitespace-pre-line text-texto-cuerpo">{detalle.notas ?? "—"}</dd>
            </div>
          </dl>
        )}

        {pestana === "historia" && (
          <ol className="divide-y divide-borde">
            {historia.map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-sm text-texto-titulo">{e.texto}</p>
                <p className="tabular text-xs text-texto-tenue">
                  {fechaLarga.format(e.cuando)} · {e.quien}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-borde bg-superficie-sutil px-4 py-4">
        {convertir}
        <AccionesDeProspecto
          leadId={datos.id}
          nombre={datos.contacto}
          pais={detalle.countryCode}
          etapa={detalle.etapa}
          etapasPosibles={etapasPosibles}
          vendedores={vendedores}
          motivos={motivos}
          puede={{ asignar: datos.puede.asignar, descartar: datos.puede.descartar }}
          acciones={acciones}
        />
        {etapasPosibles.length === 0 && !datos.puede.asignar && !datos.puede.descartar && (
          <p className="text-xs text-texto-tenue">{ETIQUETA_DE_ETAPA[detalle.etapa]} · sin acciones para ti.</p>
        )}
        {detalle.convertido && (
          <Boton href={`/oportunidades/${detalle.convertido.opportunityId}`} variante="secundario" className="mt-2 w-full justify-center">
            Ir a la oportunidad
          </Boton>
        )}
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{etiqueta}</dt>
      <dd className={clsx("mt-0.5 truncate text-texto-cuerpo", mono && "font-mono text-xs")}>{valor}</dd>
    </div>
  );
}
