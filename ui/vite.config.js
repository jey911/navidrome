import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const frontendPort = parseInt(process.env.PORT) || 4533
const backendPort = frontendPort + 100

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      manifest: manifest(),
      // Registration is handled explicitly in index.jsx with a versioned URL.
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: true,
    port: frontendPort,
    proxy: {
      '^/(auth|api|rest|backgrounds)/.*': 'http://localhost:' + backendPort,
    },
  },
  base: './',
  define: {
    // JSONForms and other libraries use process.env
    'process.env': JSON.stringify({}),
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    reporters: ['verbose'],
    // reporters: ['default', 'hanging-process'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: [],
    },
  },
})

// PWA manifest
function manifest() {
  return {
    name: 'Navidrome',
    short_name: 'Navidrome',
    description:
      'Navidrome, an open source web-based music collection server and streamer',
    categories: ['music', 'entertainment'],
    display: 'standalone',
    // `id` fija la identidad de la app instalada: sin él, si algún día cambia
    // `start_url`, iOS y Android la Guardian como una app distinta.
    id: './',
    start_url: './',
    scope: './',
    // Colores en hexadecimal: el manifest exige formato CSS y `blue`/`white`
    // son nombres, que los lanzadores interpretan a su antojo (o ignoran) y
    // acaban dejando la barra de estado de un color que no es el de la app.
    // Estos son los del tema "Mi Música" (mm-theme.css).
    background_color: '#07101b',
    theme_color: '#07101b',
    // El icono grande lo usa iOS para el icono de la pantalla de inicio y los
    // "maskable" para los lanzadores que recortan a su propia forma; sin
    // ellos, el icono sale con el logo cortado por la máscara del sistema.
    icons: [
      {
        src: './apple-touch-icon-180x180.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: './android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: './android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: './android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: './android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Canciones',
        short_name: 'Canciones',
        url: './#/song',
        icons: [{ src: './apple-touch-icon-180x180.png', sizes: '180x180' }],
      },
      {
        name: 'Álbumes',
        short_name: 'Álbumes',
        url: './#/album',
        icons: [{ src: './apple-touch-icon-180x180.png', sizes: '180x180' }],
      },
      {
        name: 'Listas',
        short_name: 'Listas',
        url: './#/playlist',
        icons: [{ src: './apple-touch-icon-180x180.png', sizes: '180x180' }],
      },
    ],
  }
}
