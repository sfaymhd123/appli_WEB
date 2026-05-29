/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm clinical palette (expanded into a design system in P4).
        clinical: {
          DEFAULT: '#0f766e',
          dark: '#115e59',
          light: '#ccfbf1',
        },
      },
    },
  },
  plugins: [],
};
