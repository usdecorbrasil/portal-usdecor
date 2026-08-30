import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bello Tecido — Portal de Pedidos',
    short_name: 'Bello Tecido',
    description: 'Portal de pedidos B2B da Bello Tecido',
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
