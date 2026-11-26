/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: { 50: '#f0f7f2', 100: '#dcece0', 500: '#3e8056', 600: '#306b47', 700: '#27563b', 900: '#163b29' },
        ink: '#1e2b23'
      },
      boxShadow: {
        card: '0 12px 35px rgba(34, 57, 41, 0.07)'
      }
    }
  },
  plugins: []
};
