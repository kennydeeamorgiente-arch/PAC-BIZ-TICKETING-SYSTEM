/** @type {import('tailwindcss').Config} */
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
          50: '#f4f7ff',
          100: '#dde3f5',
          500: '#1a3daa',
          600: '#15338f',
          700: '#10296f',
        },
        secondary: {
          50: '#eaf9ec',
          100: '#cff2d3',
          500: '#3dbe45',
          600: '#35a83d',
          700: '#2c8b33',
        },
        accent: {
          50: '#e6f6f4',
          100: '#cdedea',
          500: '#2a9e8f',
          600: '#22897c',
          700: '#1b6f64',
        },
        warning: '#f59e0b',
        danger: '#e03131',
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'DM Sans', 'sans-serif'],
        heading: ['var(--font-montserrat)', 'var(--font-plus-jakarta)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

