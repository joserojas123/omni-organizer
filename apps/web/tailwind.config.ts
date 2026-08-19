import type { Config } from "tailwindcss";

/**
 * Strict-minimalism palette for Task designer: a light neutral surface, hairline
 * borders, and near-black ink. Color enters the product only through task-status
 * dots (see @omni-organizer/shared STATUS_META), never as decoration.
 */
const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#f7f7f6",
        panel: "#ffffff",
        ink: "#1c1c1a",
        "ink-soft": "#55554f",
        "ink-faint": "#8a8a83",
        "ink-ghost": "#b0b0aa",
        line: "#e2e2df",
        "line-soft": "#ececea",
        container: "#f1f1ee",
        "container-line": "#d9d9d4",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
