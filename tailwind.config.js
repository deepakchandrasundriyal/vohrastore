/** Vohra's Store — design tokens (from logo, packaging and brochure) */
module.exports = {
  content: ['./dist/**/*.html', './src/js/**/*.js'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.25rem', lg: '2rem' }, screens: { '2xl': '1240px' } },
    extend: {
      colors: {
        cream: '#FBF6EA',      // page ground (logo plate)
        paper: '#FFFDF8',      // cards / inputs
        sand: '#F3EAD3',       // quiet panels
        line: '#E7D9B8',       // hairlines
        ink: '#1F1A13',        // wordmark black-brown
        muted: '#6E6353',
        maroon: '#4B1C14',     // "Distributing Purity" tagline
        gold: { DEFAULT: '#C98A1B', deep: '#9E7210', soft: '#F2E2B8' },  // logo border / brochure brass
        leaf: { DEFAULT: '#5E8A21', deep: '#2F4A12', soft: '#E9F0D6' },  // logo leaves
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Garamond', 'Georgia', 'serif'],
        sans: ['Jost', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        deva: ['"Rozha One"', '"Noto Serif Devanagari"', 'serif'],
      },
      boxShadow: {
        lift: '0 18px 40px -22px rgba(75, 28, 20, .35)',
        sheet: '0 -10px 30px -12px rgba(31, 26, 19, .18)',
      },
      maxWidth: { prose: '65ch' },
    },
  },
  plugins: [],
};
