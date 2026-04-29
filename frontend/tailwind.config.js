module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#121212',
        sand: '#f5efe4',
        ember: '#b4472d',
        reef: '#0f766e',
        dusk: '#1f2a44',
        haze: '#fff8ef'
      },
      boxShadow: {
        bloom: '0 24px 60px -24px rgba(18, 18, 18, 0.28)'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif']
      },
      backgroundImage: {
        'hero-radial':
          'radial-gradient(circle at top left, rgba(13, 167, 162, 0.22), transparent 32%), radial-gradient(circle at bottom right, rgba(239, 106, 74, 0.25), transparent 28%)'
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
