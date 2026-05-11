module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sand: 'var(--color-sand)',
        ink: 'var(--color-ink)',
        reef: 'var(--color-reef)',
        ember: 'var(--color-ember)',
        dusk: 'var(--color-dusk)',
        haze: '#fff8ef'
      },
      boxShadow: {
        bloom: 'var(--shadow-bloom)'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif']
      },
      backgroundImage: {
        'hero-radial': 'var(--hero-radial)'
      },
      animation: {
        'slide-in': 'slideIn 0.22s ease-out'
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' }
        }
      }
    }
  },
  plugins: []
};
