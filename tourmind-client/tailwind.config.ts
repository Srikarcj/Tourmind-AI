import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0D1B2A",
        highlight: "#F4A261",
        accent: "#2A9D8F",
        panel: "#F6F1E9"
      },
      boxShadow: {
        soft: "0 12px 40px rgba(13, 27, 42, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
