"use client";

import { useActionState, useMemo, useReducer, useState } from "react";
import clsx from "clsx";
import type { ResultadoAccion } from "@/lib/acciones";
import {
  duracionEnMinutos,
  etiquetaDeDuracion,
  fechaEn,
  horaEn,
  sumarMinutos,
} from "@/lib/tiempo";
import { avisar, avisarSiCorresponde } from "@/components/ui/avisos";
import { Boton } from "@/components/ui/primitivas";
import { Icono, type NombreDeIcono } from "@/components/ui/iconos";
import {
  AreaDeTexto,
  Campo,
  Entrada,
  Panel,
  Seleccion,
  useEnvioQueConserva,
  useProblemas,
} from "@/components/ui/formulario";
import {
  estadoInicial,
  reducir,
  type AccionDeActividad,
  type EstadoDeActividad,
} from "./estadoDeActividad";

export type SincroniaDeCalendario = "AGENDADA" | "SIN_CALENDARIO" | "FALLO" | "NO_APLICA";

type Resultado = ResultadoAccion<{
  id: string;
  siguienteEn: Date | null;
  calendario: SincroniaDeCalendario;
}>;

export type TipoDeActividad = { id: string; name: string };

/** La actividad que se edita, tal como la manda el servidor. */
export type ActividadEditable = {
  id: string;
  typeId: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  /** ISO. Se convierte a fecha y hora de pared en la zona de la oportunidad. */
  startsAt: string;
  durationMin: number | null;
  hecha: boolean;
  userId: string;
  enCalendario: boolean;
};

/**
 * Qué dibujo le toca a cada tipo del catálogo.
 *
 * Los tipos son datos —Administración los renombra— así que el mapa es por
 * nombre y **con hueco**: un tipo que no esté aquí no pierde nada, simplemente
 * vive en «Otro…». Si mañana los renombran todos, la fila de botones se queda
 * vacía y el desplegable sigue ofreciendo los trece.
 */
const ICONO_DE_TIPO: Record<string, NombreDeIcono> = {
  Llamada: "telefono",
  "Reunión presencial": "contactos",
  Videollamada: "video",
  "Correo enviado": "correo",
  "Visita a sitio": "sitio",
  Seguimiento: "reloj",
};

/** Cuántos caben en la fila antes de que deje de leerse de un vistazo. */
const MAXIMO_DE_BOTONES = 6;
const DURACION_POR_OMISION_MIN = 30;

/** Estado deterministic para el render del servidor: el real llega al abrir. */
const CERRADO: EstadoDeActividad = {
  tipoId: "",
  asunto: "",
  asuntoTocado: false,
  fecha: "",
  inicio: "",
  fin: "",
  hecha: false,
  generacion: 0,
};

/** Hoy, a la siguiente media hora, en la zona de la oportunidad. */
function ahoraRedondeado(zona: string) {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const inicio = horaEn(d, zona);
  return { fecha: fechaEn(d, zona), inicio, fin: sumarMinutos(inicio, DURACION_POR_OMISION_MIN) };
}

/**
 * Nueva actividad, o la edición de una · P-02, pestaña Actividades.
 *
 * ## Agendar es lo normal; registrar lo que pasó es la excepción
 *
 * El formulario nace **por hacer**: se elige el tipo, se acepta el asunto que
 * él mismo sugiere, se pone cuándo y se guarda. Esa actividad agendada ya es
 * el próximo paso de la oportunidad, así que no hay nada que confirmar.
 * «Marcar como hecha» —abajo, junto a Guardar— convierte la captura en el
 * registro de algo que ya ocurrió, y solo entonces aparece el resultado.
 *
 * ## Las horas son de pared, en la zona de la oportunidad
 *
 * «10:30» es a las 10:30 en la ciudad del país de la oportunidad, y así se
 * muestra en todas partes y así llega al calendario de Microsoft 365. La
 * etiqueta lo dice para que nadie tenga que adivinarlo.
 *
 * ## El mismo formulario edita
 *
 * Con `actividad`, abre cargado y el botón que lo abre es el lápiz de la fila.
 * Nada más cambia: la misma acción, el mismo reductor, la misma pregunta de
 * §12.4 si al completar se queda la oportunidad sin nada pendiente.
 */
export function ComposerDeActividad({
  opportunityId,
  tipos,
  usuarios,
  usuarioActual,
  zona,
  zonaEtiqueta,
  calendarioConfigurado,
  actividad,
  accion,
}: {
  opportunityId: string;
  tipos: TipoDeActividad[];
  usuarios: { id: string; name: string }[];
  usuarioActual: string;
  zona: string;
  zonaEtiqueta: string;
  calendarioConfigurado: boolean;
  actividad?: ActividadEditable;
  accion: (previo: Resultado | null, form: FormData) => Promise<Resultado>;
}) {
  const editando = actividad != null;
  const [abierto, setAbierto] = useState(false);

  // Editar arranca con la actividad; nueva arranca con «ahora», pero eso se
  // calcula al abrir y no al renderizar, para que el servidor y el navegador
  // pinten lo mismo.
  const inicialDeEdicion = useMemo(() => {
    if (!actividad) return null;
    const empieza = new Date(actividad.startsAt);
    const inicio = horaEn(empieza, zona);
    return estadoInicial({
      tipo: tipos.find((t) => t.id === actividad.typeId) ?? tipos[0],
      asunto: actividad.subject,
      fecha: fechaEn(empieza, zona),
      inicio,
      fin: sumarMinutos(inicio, actividad.durationMin ?? DURACION_POR_OMISION_MIN),
      hecha: actividad.hecha,
    });
  }, [actividad, tipos, zona]);

  const [estado, despachar] = useReducer(reducir, inicialDeEdicion ?? CERRADO);

  function estadoFresco(): EstadoDeActividad {
    return inicialDeEdicion ?? estadoInicial({ tipo: tipos[0], ...ahoraRedondeado(zona) });
  }

  const [resultado, enviar, enviando] = useActionState(
    async (previo: Resultado | null, form: FormData) => {
      const r = await accion(previo, form);
      if (!r.ok) {
        avisarSiCorresponde(r);
        return r;
      }
      setAbierto(false);
      despachar({ tipo: "LIMPIAR", inicial: estadoFresco() });
      avisarResultado(r.datos, { editando, hecha: estado.hecha });
      return r;
    },
    null,
  );

  const problemas = useProblemas(resultado);
  const alEnviar = useEnvioQueConserva(enviar);

  const { conBoton, enDesplegable } = useMemo(() => reparte(tipos), [tipos]);
  const pideConfirmacion = resultado != null && !resultado.ok && resultado.motivo === "CONFIRMACION";

  function abrir() {
    despachar({ tipo: "LIMPIAR", inicial: estadoFresco() });
    problemas.reiniciar();
    setAbierto(true);
  }

  function cerrar() {
    problemas.reiniciar();
    setAbierto(false);
  }

  function elegirTipo(t: TipoDeActividad) {
    despachar({ tipo: "ELEGIR_TIPO", id: t.id, nombre: t.name });
    problemas.corregir("typeId");
    problemas.corregir("subject");
  }

  return (
    <>
      {editando ? (
        <button
          type="button"
          onClick={abrir}
          aria-label={`Editar «${actividad.subject}»`}
          title="Editar actividad"
          className="rounded-sm p-1.5 text-texto-tenue transition-colors duration-rapido hover:bg-superficie-sutil hover:text-texto-cuerpo focus:shadow-ring focus:outline-none"
        >
          <Icono nombre="lapiz" className="size-4" />
        </button>
      ) : (
        <Boton onClick={abrir}>Nueva actividad</Boton>
      )}

      <Panel
        titulo={editando ? "Editar actividad" : "Nueva actividad"}
        subtitulo={
          editando
            ? "Los cambios llegan también al calendario, si estaba agendada ahí."
            : "Agenda lo que sigue, o marca como hecha para registrar lo que acaba de pasar."
        }
        abierto={abierto}
        alCerrar={cerrar}
        ancho="lg"
        pie={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-texto-cuerpo">
              <input
                type="checkbox"
                name="hecha"
                // Vive en el pie del panel, fuera del <form>: `form` es lo que
                // la incluye en el envío, igual que a los botones de guardar.
                form={idDelFormulario(actividad)}
                checked={estado.hecha}
                onChange={(e) => despachar({ tipo: "MARCAR_HECHA", hecha: e.target.checked })}
                className="size-4 rounded-xs border-borde-fuerte text-acento focus:shadow-ring"
              />
              Marcar como hecha
            </label>
            <div className="flex items-center gap-2">
              <Boton variante="fantasma" type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" form={idDelFormulario(actividad)} disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </>
        }
      >
        {/* Se envía desde onSubmit y no con action=: así un rechazo del servidor
            no reinicia lo capturado (useEnvioQueConserva). */}
        <form
          key={estado.generacion}
          id={idDelFormulario(actividad)}
          onSubmit={alEnviar}
          onChange={problemas.alCambiar}
          className="flex flex-col gap-5"
        >
          <input type="hidden" name="opportunityId" value={opportunityId} />
          {actividad && <input type="hidden" name="activityId" value={actividad.id} />}
          <input type="hidden" name="typeId" value={estado.tipoId} />

          {/* El asunto va primero y sin etiqueta: es el título de lo que se
              captura, y llega sugerido por el tipo. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="subject" className="sr-only">
              Asunto
            </label>
            <input
              id="subject"
              name="subject"
              value={estado.asunto}
              onChange={(e) => despachar({ tipo: "ESCRIBIR_ASUNTO", asunto: e.target.value })}
              placeholder="De qué se trata"
              autoComplete="off"
              className={clsx(
                "w-full rounded-sm border bg-superficie-pagina px-3 py-2.5 text-base font-medium",
                "text-texto-titulo outline-none transition-colors duration-rapido ease-estandar",
                "placeholder:font-normal placeholder:text-gray-40 focus:border-acento focus:shadow-ring",
                problemas.problema("subject") ? "border-peligro" : "border-borde",
              )}
            />
            {problemas.problema("subject") && (
              <p role="alert" className="text-xs font-medium text-peligro">
                {problemas.problema("subject")}
              </p>
            )}
          </div>

          <SelectorDeTipo
            conBoton={conBoton}
            enDesplegable={enDesplegable}
            activo={estado.tipoId}
            alElegir={elegirTipo}
          />

          <Horario
            estado={estado}
            despachar={despachar}
            problema={problemas.problema}
            zonaEtiqueta={zonaEtiqueta}
          />

          <Campo
            etiqueta="Responsable"
            htmlFor="userId"
            problema={problemas.problema("userId")}
            ayuda={
              calendarioConfigurado && !estado.hecha
                ? "Se agenda en su calendario de Microsoft 365."
                : undefined
            }
          >
            <Seleccion
              id="userId"
              name="userId"
              defaultValue={actividad?.userId ?? usuarioActual}
              problema={problemas.problema("userId")}
            >
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === usuarioActual ? `${u.name} (tú)` : u.name}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo etiqueta="Notas" htmlFor="notas">
            <AreaDeTexto
              id="notas"
              name="notas"
              rows={3}
              defaultValue={actividad?.notes ?? ""}
              placeholder="Lo que haga falta recordar"
            />
          </Campo>

          {/* El resultado solo existe hacia atrás: pedirlo de algo que todavía
              no pasa es pedir que lo inventen. */}
          {estado.hecha && (
            <Campo
              etiqueta="Resultado"
              htmlFor="outcome"
              ayuda="Lo que cambió: qué dijeron, qué falta, con quién hay que hablar."
            >
              <AreaDeTexto
                id="outcome"
                name="outcome"
                defaultValue={actividad?.outcome ?? ""}
                placeholder="Qué salió de la conversación"
              />
            </Campo>
          )}

          {pideConfirmacion && (
            <SinProximoPaso
              tipos={tipos}
              tipoSugerido={estado.tipoId}
              fechaSugerida={estado.fecha}
              enviando={enviando}
              mensaje={resultado.problemas.map((p) => p.mensaje).join(" ")}
              problema={problemas.problema}
            />
          )}
        </form>
      </Panel>
    </>
  );
}

function idDelFormulario(actividad: ActividadEditable | undefined) {
  return actividad ? `editar-actividad-${actividad.id}` : "nueva-actividad";
}

/** Los tipos con dibujo como botones; el resto, en «Otro…». Uno solo activo. */
function SelectorDeTipo({
  conBoton,
  enDesplegable,
  activo,
  alElegir,
}: {
  conBoton: TipoDeActividad[];
  enDesplegable: TipoDeActividad[];
  activo: string;
  alElegir: (t: TipoDeActividad) => void;
}) {
  const activoEnDesplegable = enDesplegable.some((t) => t.id === activo);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {conBoton.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={t.id === activo}
          onClick={() => alElegir(t)}
          className={clsx(
            "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm",
            "transition-colors duration-rapido ease-estandar focus:shadow-ring focus:outline-none",
            t.id === activo
              ? "border-acento bg-superficie-tinte font-semibold text-acento"
              : "border-borde text-texto-cuerpo hover:bg-superficie-sutil",
          )}
        >
          <Icono nombre={ICONO_DE_TIPO[t.name] ?? "actividades"} className="size-4" />
          {t.name}
        </button>
      ))}

      {enDesplegable.length > 0 && (
        <select
          aria-label="Otro tipo de actividad"
          value={activoEnDesplegable ? activo : ""}
          onChange={(e) => {
            const t = enDesplegable.find((x) => x.id === e.target.value);
            if (t) alElegir(t);
          }}
          className={clsx(
            "rounded-sm border bg-superficie-pagina px-3 py-1.5 pr-8 text-sm",
            "outline-none transition-colors duration-rapido ease-estandar focus:border-acento focus:shadow-ring",
            activoEnDesplegable
              ? "border-acento bg-superficie-tinte font-semibold text-acento"
              : "border-borde text-texto-tenue",
          )}
        >
          <option value="">Otro…</option>
          {enDesplegable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Fecha, inicio y fin en una fila, como en cualquier calendario, con la
 * duración al lado. La zona va en la etiqueta: «10:30» es en esa ciudad.
 * 9rem por hora: el control nativo en español pinta «10:30 a. m.» y a menos
 * ancho lo recorta.
 */
function Horario({
  estado,
  despachar,
  problema,
  zonaEtiqueta,
}: {
  estado: EstadoDeActividad;
  despachar: React.Dispatch<AccionDeActividad>;
  problema: (campo: string) => string | undefined;
  zonaEtiqueta: string;
}) {
  const duracion = duracionEnMinutos(estado.inicio, estado.fin);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-end">
      <Campo
        etiqueta={estado.hecha ? "Cuándo ocurrió" : "Cuándo"}
        htmlFor="fecha"
        problema={problema("fecha")}
      >
        <Entrada
          id="fecha"
          name="fecha"
          type="date"
          value={estado.fecha}
          onChange={(e) => despachar({ tipo: "CAMBIAR_FECHA", fecha: e.target.value })}
          problema={problema("fecha")}
          className="tabular"
        />
      </Campo>
      <Campo etiqueta="Inicio" htmlFor="inicio" problema={problema("inicio")}>
        <Entrada
          id="inicio"
          name="inicio"
          type="time"
          step={300}
          value={estado.inicio}
          onChange={(e) => despachar({ tipo: "CAMBIAR_INICIO", inicio: e.target.value })}
          className="tabular"
        />
      </Campo>
      <Campo etiqueta="Fin" htmlFor="fin" problema={problema("fin")}>
        <Entrada
          id="fin"
          name="fin"
          type="time"
          step={300}
          value={estado.fin}
          onChange={(e) => despachar({ tipo: "CAMBIAR_FIN", fin: e.target.value })}
          problema={problema("fin")}
          className="tabular"
        />
      </Campo>
      <p
        className={clsx(
          "col-span-2 -mt-3 text-xs sm:col-span-1 sm:mt-0 sm:pb-2.5",
          duracion > 0 ? "text-texto-tenue" : "font-medium text-peligro",
        )}
      >
        {duracion > 0 ? etiquetaDeDuracion(duracion) : "Termina antes de empezar"}
        <span className="block text-texto-tenue">Hora de {zonaEtiqueta}</span>
      </p>
    </div>
  );
}

/**
 * Lo que se le dice al usuario cuando se guardó. El calendario tiene su propio
 * aviso cuando falla: la actividad existe, pero no llegó a Microsoft 365, y
 * eso hay que decirlo aparte para que no se lea como éxito a medias.
 */
function avisarResultado(
  datos: { siguienteEn: Date | null; calendario: SincroniaDeCalendario },
  contexto: { editando: boolean; hecha: boolean },
) {
  const titulo = contexto.editando
    ? "Actividad actualizada"
    : contexto.hecha
      ? "Actividad registrada"
      : "Actividad agendada";

  const detalle =
    datos.calendario === "AGENDADA"
      ? "También en el calendario de Microsoft 365 del responsable."
      : contexto.hecha && !datos.siguienteEn
        ? "Sin próximo paso: aparecerá mañana en tu bandeja."
        : undefined;

  avisar.exito(titulo, detalle);

  if (datos.calendario === "FALLO") {
    avisar.advertencia(
      "Guardada en el CRM, no en el calendario",
      "Microsoft 365 no respondió. Edita la actividad y guarda de nuevo para reintentar.",
    );
  }
}

/**
 * La pregunta de §12.4, cuando de verdad aplica.
 *
 * Aparece después de guardar algo hecho que deja la oportunidad sin nada
 * agendado. Se responde de las dos maneras y desde aquí: llenando el paso que
 * sigue y pulsando Guardar, o diciendo que no habrá. Lo capturado arriba sigue
 * intacto.
 */
function SinProximoPaso({
  tipos,
  tipoSugerido,
  fechaSugerida,
  enviando,
  mensaje,
  problema,
}: {
  tipos: TipoDeActividad[];
  tipoSugerido: string;
  fechaSugerida: string;
  enviando: boolean;
  mensaje: string;
  problema: (campo: string) => string | undefined;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-4 rounded-sm border border-borde-fuerte bg-superficie-tinte px-4 py-3.5"
    >
      <p className="text-sm text-texto-cuerpo">{mensaje}</p>
      {/* Dos caminos y dos botones, no tres: el de arriba guarda con lo que
          haya en estos campos, y el de abajo es el de decir que no habrá. */}
      <p className="-mt-2 text-xs text-texto-tenue">
        Agenda aquí el que sigue y pulsa «Guardar», o ciérrala sin seguimiento.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_10rem]">
        <Campo etiqueta="Tipo" htmlFor="siguienteTypeId">
          <Seleccion id="siguienteTypeId" name="siguienteTypeId" defaultValue={tipoSugerido}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Seleccion>
        </Campo>
        <Campo
          etiqueta="Qué sigue"
          htmlFor="siguienteSubject"
          problema={problema("siguiente.subject")}
        >
          <Entrada
            id="siguienteSubject"
            name="siguienteSubject"
            placeholder="La acción concreta que sigue"
            problema={problema("siguiente.subject")}
          />
        </Campo>
        <Campo etiqueta="Cuándo" htmlFor="siguienteStartsAt">
          <Entrada
            id="siguienteStartsAt"
            name="siguienteStartsAt"
            type="date"
            defaultValue={fechaSugerida}
            className="tabular"
          />
        </Campo>
      </div>

      <div>
        <Boton
          variante="secundario"
          type="submit"
          name="sinSeguimiento"
          value="true"
          disabled={enviando}
        >
          Guardar sin seguimiento
        </Boton>
      </div>
    </div>
  );
}

/** Los que tienen dibujo van a la fila; el resto, al desplegable. */
function reparte(tipos: TipoDeActividad[]) {
  const conBoton: TipoDeActividad[] = [];
  const enDesplegable: TipoDeActividad[] = [];

  for (const t of tipos) {
    if (ICONO_DE_TIPO[t.name] && conBoton.length < MAXIMO_DE_BOTONES) conBoton.push(t);
    else enDesplegable.push(t);
  }
  return { conBoton, enDesplegable };
}
