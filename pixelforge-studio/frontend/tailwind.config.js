/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d12",
        panel: "#131821",
        raised: "#1b2230",
        line: "#2c3548",
        mist: "#93a0b5",
        accent: "#e3a15a",
        accent2: "#8eb4ff",
      },
      boxShadow: {
        panel: "0 12px 40px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
