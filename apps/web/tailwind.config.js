/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm clinical palette (teal). High contrast against white surfaces;
        // 700 is the brand default used for primary actions.
        clinical: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          DEFAULT: '#0f766e',
          dark: '#115e59',
          light: '#ccfbf1',
        },
        // Triage priority levels P1..P5 (CLAUDE.md §2 / M2). Used by Badge.
        priority: {
          p1: '#dc2626', // critical  — red-600
          p2: '#ea580c', // high      — orange-600
          p3: '#ca8a04', // medium    — yellow-600
          p4: '#16a34a', // low       — green-600
          p5: '#2563eb', // non-urgent— blue-600
        },
        // DetectedIssue.severity (CLAUDE.md §7). Used by Badge.
        severity: {
          high: '#dc2626',
          moderate: '#d97706',
          low: '#16a34a',
        },
      },
      // Large tap targets for rural / older users (min 44px, WCAG-friendly).
      minHeight: {
        tap: '2.75rem',
      },
      minWidth: {
        tap: '2.75rem',
      },
      spacing: {
        tap: '2.75rem',
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};
