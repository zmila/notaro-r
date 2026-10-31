import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // shortcuts.html / markdown.html: the Help > Keyboard Shortcuts / Markdown Syntax windows (tiny.win.open)
      input: { main: 'index.html', shortcuts: 'shortcuts.html', markdown: 'markdown.html' },
    },
  },
})
