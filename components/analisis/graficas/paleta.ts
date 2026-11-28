/**
 * La paleta de las gráficas · tokens de AVATTAR v4 (§74) en hexadecimal, porque
 * Recharts pinta SVG con atributos y no con clases. Azul para lo ganado, que es
 * la medida principal; verde de estado para la utilidad; el costo en navy claro
 * porque no es una alarma, es la otra mitad de la venta; el margen en navy
 * medio. Nada saturado fuera del azul de la marca.
 */
export const PALETA = {
  ganado: "#5da7e6",
  ganadoTenue: "#bdd9f3",
  cuota: "#dbebfa",
  cuotaBorde: "#93c1ea",
  utilidad: "#2f9e6d",
  costo: "#9fb2c8",
  margen: "#4f6b8d",
  /** Ponderado = importe × probabilidad: el mismo verde de estado que la utilidad. */
  ponderado: "#2f9e6d",
  /** Estados de etapa y de las abiertas: lima (aviso), coral (atención) y magenta (vencidas), del manual. */
  riesgo: "#d0df00",
  peligro: "#ff595a",
  vencida: "#cc27b0",
  rejilla: "#eceef1",
  eje: "#808a96",
  texto: "#365072",
  cursor: "rgba(93, 167, 230, 0.08)",
} as const;

export const TIPOGRAFIA_DE_EJE = { fill: PALETA.eje, fontSize: 11 } as const;
export const ETIQUETA_DE_BARRA = { fill: PALETA.texto, fontSize: 11, fontWeight: 600 } as const;
