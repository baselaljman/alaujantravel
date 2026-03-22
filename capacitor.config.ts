import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wabus.app',
  appName: 'WA-Bus-Tracking',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Geolocation: {
      // Configuration for Geolocation plugin
    }
  }
};

export default config;
