/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary dark green — nav, hero, footer, buttons. Matches wordmark color.
        primary: {
          DEFAULT: '#122A1C',
          light:   '#1a3a28',
          lighter: '#22503a',
        },
        // Warm cream — page background and card fills
        cream: {
          DEFAULT: '#F2EDE4',
          light:   '#FAF7F2',
          dark:    '#E8E0D4',
        },
        // Gold — accent color for the logo head, ticker bar, badges
        gold: {
          DEFAULT: '#CB9F32',
          light:   '#D4B84A',
          dark:    '#A8831F',
        },
      },
    },
  },
  plugins: [],
}
