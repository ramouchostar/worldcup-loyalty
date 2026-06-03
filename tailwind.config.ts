import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#C8102E",
          gold: "#F5A623",
          dark: "#1A1A2E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
