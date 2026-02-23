/** @type {import(''tailwindcss'').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f4ff",
          100: "#e0e7ff",
          500: "#1E2761",
          600: "#1a2256",
          700: "#161d4a",
        },
        secondary: {
          50: "#e6f9f5",
          100: "#ccf3eb",
          500: "#028090",
          600: "#027380",
          700: "#016670",
        },
        accent: {
          500: "#02C39A",
          600: "#02b08a",
        },
        warning: "#F59E0B",
        danger: "#E03131",
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

