import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'

export const metadata: Metadata = {
  title: 'Colorado Camp Finder',
  description: 'Find available campgrounds and dispersed camping in Colorado',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CO Camp Finder',
  },
}

export const viewport: Viewport = {
  themeColor: '#1c1917',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased bg-stone-950">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
