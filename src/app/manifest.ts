import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Best Color Tecidos — Portal de Pedidos',
    short_name: 'Best Color Tecidos',
    description: 'Portal de pedidos B2B da Best Color Tecidos',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F2F1ED',
    theme_color: '#131A2E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
