/** @type {import('tailwindcss').Config} */
export default {
  // Make Tailwind's dark: utilities follow BuddyForStudy's explicit theme choice,
  // not the operating system preference unless the user selected System.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
