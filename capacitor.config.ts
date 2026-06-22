import type { CapacitorConfig } from '@capacitor/cli'

// After deploying to Vercel, replace localhost:3000 with your Vercel URL
// e.g. https://colorado-camping-finder.vercel.app
const PRODUCTION_URL = process.env.CAPACITOR_SERVER_URL || 'https://colorado-camping-finder.vercel.app'

const config: CapacitorConfig = {
  appId: 'com.coloradocampfinder.app',
  appName: 'CO Camp Finder',
  webDir: 'public',  // unused when server.url is set; required field
  server: {
    url: PRODUCTION_URL,
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#1c1917',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1c1917',
      showSpinner: false,
    },
  },
}

export default config
