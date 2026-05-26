import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        midnight: "#0a1028",
        nebula: "#6d4df2",
        moon: "#f7f1df",
        lavender: "#cbb8ff",
        aurora: "#8ef0dd"
      },
      boxShadow: {
        glow: "0 0 42px rgba(203, 184, 255, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
