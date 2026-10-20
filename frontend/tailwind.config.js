/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        brand: ['Montserrat', 'Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#FAF7F2',
        surface: '#FFFFFF',
        ink: '#241F19',
        muted: '#6E655B',
        line: '#EDE4D8',
        coral: { DEFAULT: '#E06F56', tint: '#FBE7E0', 600: '#b85542' },
        amber: { DEFAULT: '#FFD64E', tint: '#FFF3D0', deep: '#8A6A00' },
        plum: { DEFAULT: '#6B21A8', tint: '#EDE4F7' },
        primary: {
          DEFAULT: '#C1075D',
          tint: '#FBE9F0',
          50: '#fdf2f6',
          100: '#fce7f0',
          200: '#fbd0e1',
          300: '#f9a9c6',
          400: '#f470a3',
          500: '#ec3d80',
          600: '#d81b60',
          700: '#c1075d',
          800: '#8a0542',
          900: '#700436',
          950: '#4a0121',
        },
        neutral: {
          50: '#faf9f8',
          100: '#f5f3f0',
          200: '#e5e1dc',
          300: '#d1cbc2',
          400: '#a09a92',
          500: '#7a756d',
          600: '#5c574f',
          700: '#4a453e',
          800: '#3a362f',
          900: '#2a2620',
          950: '#17140f',
        },
      },
      borderRadius: {
        card: '24px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 8px 24px rgba(58, 46, 31, 0.07)',
        'card-hover': '0 12px 32px rgba(58, 46, 31, 0.11)',
        brand: '0 6px 16px rgba(193, 7, 93, 0.25)',
        pop: '0 10px 24px rgba(58, 46, 31, 0.15)',
      },
      backgroundImage: {
        brand: 'linear-gradient(45deg, #C1075D, #E06F56)',
      },
      keyframes: {
        'route-dash': { to: { strokeDashoffset: '-14' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'route-dash': 'route-dash 1.2s linear infinite',
        'fade-up': 'fade-up 300ms ease-out both',
      },
    },
  },
  plugins: [],
}
