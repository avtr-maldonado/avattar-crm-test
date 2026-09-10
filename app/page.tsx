import { redirect } from "next/navigation";

/**
 * La raíz manda al pipeline: es la pantalla principal del sistema y la primera
 * pregunta que un vendedor y un gerente se hacen todos los días (P-01).
 */
export default function Home() {
  redirect("/oportunidades");
}
