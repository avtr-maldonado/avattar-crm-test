"use client";

import { useEffect, useRef } from "react";
import { Toaster } from "sileo";
import "sileo/styles.css";
import { ID_CAPA_DE_AVISOS } from "./avisos";

/**
 * Avisos efímeros · el único lugar donde se configura Sileo.
 *
 * ## Qué va en un aviso y qué NO
 *
 * Esta es la decisión que importa, y no es de estilo. Un aviso se va solo: si
 * lo que dice hace falta para corregir algo, no puede irse solo.
 *
 * | Motivo de `ResultadoAccion` | Dónde | Por qué |
 * |---|---|---|
 * | `VALIDACION` | **en el campo** | Se corrige ahí mismo. §13.5 pide el dato concreto junto al control |
 * | `COMPUERTA` | **en el formulario** | §13.5: «alertas de política dentro del formulario, no en un modal: se ven mientras se teclea». Y la lista completa de requisitos faltantes no cabe en un aviso |
 * | `CONFIRMACION` | **en el formulario** | El DEBE de §12.4 exige preguntar y reenviar, no avisar y desvanecerse |
 * | `AUTORIZACION` | **aviso** | No hay nada que corregir en el formulario: la respuesta es sobre quién eres, no sobre lo que escribiste |
 * | `CONFLICTO` | **aviso** | El formulario está viejo. El mensaje es sobre el mundo, no sobre lo tecleado |
 *
 * Los tres primeros ya se pintan con `AvisosDeAccion` y `problemaDe`, y **no
 * se reemplazan**: tienen un trabajo específico en la pantalla.
 *
 * Lo demás que sí merece aviso: que una operación terminó cuando la pantalla
 * no lo deja ver por sí sola, y las advertencias que el usuario necesita saber
 * pero que no deben detenerlo.
 *
 * ## Por qué el `Toaster` vive en el layout
 *
 * Montado una vez en `app/(app)/layout.tsx`, sobrevive a la navegación dentro
 * del grupo. Eso permite avisar **antes** de cambiar de pantalla y que el aviso
 * siga ahí al llegar: es lo que hace posible confirmar un alta y aun así llevar
 * al usuario al detalle de lo que acaba de crear.
 *
 * ## Por qué va dentro de una capa `popover` (§59)
 *
 * Un `Panel` abierto es un `<dialog>` modal y vive en el top layer, por encima
 * de cualquier `z-index`; los avisos quedaban detrás de su fondo oscurecido.
 * La capa es un popover manual, que también va al top layer, y `avisar` la
 * vuelve a mostrar antes de cada aviso para quedar encima de lo abierto. Se
 * abre al montar; sin soporte de `popover`, el `div` se queda como estaba.
 */
export function Notificaciones() {
  const capa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = capa.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (!el.matches(":popover-open")) el.showPopover();
  }, []);

  return (
    <div ref={capa} id={ID_CAPA_DE_AVISOS} popover="manual" className="capa-de-avisos">
      <Toaster
        // Abajo a la derecha: arriba compite con la barra superior fija, que ya
        // lleva el título de la pantalla y el buscador.
        position="bottom-right"
        theme="light"
        offset={{ bottom: 24, right: 24 }}
        options={{
          // Tiempo suficiente para leer dos renglones sin releer a las carreras.
          duration: 5000,
          roundness: 8,
        }}
      />
    </div>
  );
}
