/** Vohra's Store — design tokens (from logo, packaging and brochure) */
module.exports = {
  content: ['./dist/**/*.html', './src/js/**/*.js'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.25rem', lg: '2rem' }, screens: { '2xl': '1240px' } },
    extend: {
      colors: {
        cream: '#FFFFFF',      // page ground (white)
        paper: '#FFFFFF',      // cards / inputs
        sand: '#F6F4F2',       // quiet panels
        line: '#E8E2DD',       // hairlines
        ink: '#141010',        // near-black text
        muted: '#5C5552',
        maroon: '#B3261E',     // chilli red — primary CTAs (Peri Peri tin, logo tagline)
        cocoa: { DEFAULT: '#2B140C', deep: '#140805', soft: '#4A2416' },  // dark hero ground
        mustard: '#F7C531',    // Cheesy Delight tin yellow
        plum: '#3E1F3A',       // Pink Salt tin purple — videos section
        gold: { DEFAULT: '#B8862B', deep: '#8C6418', soft: '#F9D45C' },  // logo border / brochure brass; soft = light mustard panels
        leaf: { DEFAULT: '#4F7A28', deep: '#2F4A12', soft: '#E9F0D6' },  // logo leaves
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Garamond', 'Georgia', 'serif'],
        sans: ['Jost', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        deva: ['"Rozha One"', '"Noto Serif Devanagari"', 'serif'],
      },
      boxShadow: {
        lift: '0 18px 40px -22px rgba(75, 28, 20, .35)',
        sheet: '0 -10px 30px -12px rgba(42,21,18, .18)',
      },
      maxWidth: { prose: '65ch' },
    },
  },
  plugins: [],
};
