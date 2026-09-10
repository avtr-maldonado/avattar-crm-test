"use client";

import { Toaster } from "sileo";
import "sileo/styles.css";

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
 */
export function Notificaciones() {
  return (
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
  );
}
