import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth, updateDoc, doc } from '../firebase';

export const initializePushNotifications = async () => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('Push notifications are not supported on web in this implementation.');
    return;
  }

  try {
    // Create a default notification channel for Android (required for Android 8+)
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'Default Channel',
        description: 'Default channel for all notifications',
        importance: 5, // High importance
        visibility: 1, // Public
        vibration: true,
        sound: 'default'
      });
      console.log('Notification channel created for Android.');
    }

    // Request permission to use push notifications
    let permStatus = await PushNotifications.checkPermissions();
    console.log('Current notification permission status:', permStatus.receive);

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
      console.log('Permission request result:', permStatus.receive);
    }

    if (permStatus.receive !== 'granted') {
      console.warn('User denied push notification permissions!');
      return;
    }

    // On success, we should be able to receive notifications
    console.log('Registering for push notifications...');
    try {
      await PushNotifications.register();
      console.log('Push registration call completed.');
    } catch (regErr) {
      console.error('Error during PushNotifications.register():', regErr);
    }

    // Listen for registration success
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success! Token:', token.value);
      // Store token in window for easy debugging in console
      (window as any).fcmToken = token.value;
      saveTokenToFirestore(token.value);
    });

    // Listen for registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration: ' + JSON.stringify(error));
    });

    // Handle received notifications while app is open
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received: ' + JSON.stringify(notification));
      // You could trigger an in-app toast here if needed
    });

    // Handle notification action (tapping on it)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push action performed: ' + JSON.stringify(notification));
    });

  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
  }
};

const saveTokenToFirestore = async (token: string) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
      await updateDoc(doc(db, 'users', user.uid), {
        fcmToken: token,
        deviceType: platform
      });
    } catch (error) {
      console.error('Error saving token to firestore:', error);
    }
  }
};
