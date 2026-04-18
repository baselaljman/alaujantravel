import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aloujan.bus', // تأكد أن هذا يطابق ما وضعته في Firebase
  appName: 'العوجان للسياحة والسفر', // تم تعديل الاسم هنا
  webDir: 'dist',
  server: {
    androidScheme: 'https', // استخدم HTTPS
    hostname: 'localhost',  // الدومين المحلي الذي أضفناه في Firebase
    allowNavigation: [
      'ais-pre-gklusr66slg5nx546qr4zv-402389654188.europe-west2.run.app',
      'ais-dev-gklusr66slg5nx546qr4zv-402389654188.europe-west2.run.app',
      'alaujantravel.com'  // أضف الدومين الجديد هنا
    ]
  },
  plugins: {
    Geolocation: {
      // Configuration for Geolocation plugin
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "phone"]
    }
  }
};

export default config;