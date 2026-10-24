import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.inderdrag.racionika',
  appName: 'Рационика',
  webDir: 'dist',
  server: { androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: { SplashScreen: { launchAutoHide: true, backgroundColor: '#F5F8F5' } },
};
export default config;
