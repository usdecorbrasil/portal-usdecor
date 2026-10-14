import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'US Decor — Portal interno',
    short_name: 'US Decor',
    description: 'Gestão interna da US Decor: produtos, estoque, pedidos dos marketplaces e financeiro',
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
