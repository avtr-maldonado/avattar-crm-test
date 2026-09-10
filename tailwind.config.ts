import type { Config } from "tailwindcss";

/**
 * El tema **mapea** a las variables CSS de `app/globals.css`, no las duplica.
 *
 * Los tokens del manual gráfico viven en un solo lugar (§13). Si aquí se
 * copiaran los hex, cambiar el manual obligaría a cambiar dos archivos y uno de
 * los dos se quedaría atrás.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marca
        blue: {
          50: "var(--blue-50)", 100: "var(--blue-100)", 200: "var(--blue-200)",
          300: "var(--blue-300)", 400: "var(--blue-400)", 500: "var(--blue-500)",
          600: "var(--blue-600)", 700: "var(--blue-700)", 800: "var(--blue-800)",
          900: "var(--blue-900)",
        },
        navy: {
          50: "var(--navy-50)", 100: "var(--navy-100)", 200: "var(--navy-200)",
          300: "var(--navy-300)", 400: "var(--navy-400)", 500: "var(--navy-500)",
          600: "var(--navy-600)", 700: "var(--navy-700)", 800: "var(--navy-800)",
          900: "var(--navy-900)", 950: "var(--navy-950)",
        },
        gray: {
          "05": "var(--gray-05)", 10: "var(--gray-10)", 20: "var(--gray-20)",
          40: "var(--gray-40)", 50: "var(--gray-50)", 70: "var(--gray-70)",
          90: "var(--gray-90)",
        },
        // Estado. §13.1: si algo es rojo, requiere atención. Nunca decorativo.
        exito: "var(--status-success)",
        alerta: "var(--status-warning)",
        peligro: "var(--status-danger)",
        informacion: "var(--status-info)",
        // Complementarios, de uso mínimo
        magenta: "var(--avattar-magenta)",
        lima: "var(--avattar-lime)",
        coral: "var(--avattar-coral)",
        // Alias semánticos — lo que los componentes deben usar
        acento: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          activo: "var(--accent-active)",
          texto: "var(--on-accent)",
        },
        texto: {
          titulo: "var(--text-heading)",
          cuerpo: "var(--text-body)",
          tenue: "var(--text-muted)",
        },
        superficie: {
          pagina: "var(--surface-page)",
          sutil: "var(--surface-subtle)",
          tarjeta: "var(--surface-card)",
          tinte: "var(--surface-tint)",
        },
        borde: {
          DEFAULT: "var(--border)",
          fuerte: "var(--border-strong)",
        },
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-montserrat)", "sans-serif"],
      },
      fontSize: {
        h1: ["var(--fs-h1)", { lineHeight: "var(--lh-tight)" }],
        h2: ["var(--fs-h2)", { lineHeight: "var(--lh-heading)" }],
        h3: ["var(--fs-h3)", { lineHeight: "var(--lh-heading)" }],
        h4: ["var(--fs-h4)", { lineHeight: "var(--lh-snug)" }],
        lg: "var(--fs-lg)",
        body: "var(--fs-body)",
        sm: "var(--fs-sm)",
        xs: "var(--fs-xs)",
        eyebrow: "var(--fs-eyebrow)",
      },
      borderRadius: {
        xs: "var(--radius-xs)", sm: "var(--radius-sm)", md: "var(--radius-md)",
        lg: "var(--radius-lg)", pill: "var(--radius-pill)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)", sm: "var(--shadow-sm)", md: "var(--shadow-md)",
        ring: "var(--ring)",
      },
      transitionTimingFunction: { estandar: "var(--ease-standard)" },
      transitionDuration: { rapido: "var(--dur-fast)", base: "var(--dur-base)" },
    },
  },
  plugins: [],
};

export default config;
