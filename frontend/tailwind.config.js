/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f1117',
        panel:   '#161b22',
        border:  '#21262d',
        muted:   '#6e7681',
      },
    },
  },
  plugins: [],
}
