import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Near-monochrome palette with a single restrained accent.
        ink: {
          DEFAULT: "#0a0a0b",
          soft: "#16161a",
          muted: "#6b6b76",
          faint: "#9a9aa6",
        },
        paper: {
          DEFAULT: "#fbfbfa",
          soft: "#f3f3f1",
        },
        accent: {
          DEFAULT: "#c9612f", // warm ember — the one accent
          soft: "#e8a07a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        node: "0 1px 2px rgba(10,10,11,0.04), 0 8px 24px rgba(10,10,11,0.06)",
        glow: "0 0 0 1px rgba(201,97,47,0.35), 0 0 28px rgba(201,97,47,0.25)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
