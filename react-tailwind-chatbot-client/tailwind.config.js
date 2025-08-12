/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // Ensure all your React component files are included here
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- THIS MUST BE 'class'
  theme: {
    extend: {
      colors: {
        'deep-ocean': '#1d3b7e', // Your custom color
      },
    },
  },
  plugins: [],
}