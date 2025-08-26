/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layouts/**/*.{html,js}',
    './content/**/*.{md,html}',
    './assets/**/*.{js,css}',
    './_vendor/**/*.{html,js}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};


