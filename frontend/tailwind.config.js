/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Void dark backgrounds
        void: {
          950: '#030308',
          900: '#070712',
          800: '#0d0d1f',
          700: '#12122b',
          600: '#1a1a35',
          500: '#22224a',
        },
        // Neon cyan primary
        cyan: {
          DEFAULT: '#00f5ff',
          50: '#e0feff',
          100: '#b3fdff',
          200: '#66faff',
          300: '#00f5ff',
          400: '#00c8d4',
          500: '#009baa',
          600: '#006e7a',
          700: '#004d56',
          800: '#002d33',
          900: '#001518',
        },
        // Violet accent
        violet: {
          DEFAULT: '#7c3aed',
          glow: '#a855f7',
        },
        // Plasma pink
        plasma: {
          DEFAULT: '#ff006e',
          light: '#ff4d9a',
          glow: 'rgba(255,0,110,0.3)',
        },
        // Aurora green
        aurora: {
          DEFAULT: '#00ff87',
          dim: '#00cc6a',
        },
        // Surface colors
        surface: {
          DEFAULT: 'rgba(13,13,31,0.8)',
          hover: 'rgba(22,22,50,0.9)',
          border: 'rgba(0,245,255,0.12)',
          'border-hover': 'rgba(0,245,255,0.3)',
        },
      },
      backgroundImage: {
        'grid-void': `
          linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)
        `,
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'aurora-mesh': 'radial-gradient(ellipse at 20% 50%, rgba(124,58,237,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(0,245,255,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(0,255,135,0.08) 0%, transparent 50%)',
      },
      backgroundSize: {
        'grid-40': '40px 40px',
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-line': 'glow-line 3s ease-in-out infinite',
        'scan': 'scan 8s linear infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(0,245,255,0.4)' },
          '50%': { opacity: 0.7, boxShadow: '0 0 40px rgba(0,245,255,0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'glow-line': {
          '0%, 100%': { opacity: 0.3 },
          '50%': { opacity: 1 },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: 0, transform: 'translateX(20px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      },
      boxShadow: {
        'cyan-sm': '0 0 10px rgba(0,245,255,0.3)',
        'cyan-md': '0 0 20px rgba(0,245,255,0.4)',
        'cyan-lg': '0 0 40px rgba(0,245,255,0.3), 0 0 80px rgba(0,245,255,0.1)',
        'violet-md': '0 0 20px rgba(124,58,237,0.4)',
        'plasma-md': '0 0 20px rgba(255,0,110,0.4)',
        'surface': '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'surface-lg': '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      borderRadius: {
        'xl2': '1.25rem',
        '2xl2': '1.75rem',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
