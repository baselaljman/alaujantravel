import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth, updateDoc, doc } from '../firebase';

export const initializePushNotifications = async () => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('Push notifications are not supported on web in this implementation.');
    return;
  }

  // Request permission to use push notifications
  // iOS will prompt a user for permission out of the box.
  // Android will just return 'granted' if the app has the permission in its manifest.
  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    throw new Error('User denied permissions!');
  }

  // On success, we should be able to receive notifications
  await PushNotifications.register();

  // Some issue with our setup and push will cause addListener('registrationError')
  // to fire
  PushNotifications.addListener('registration', (token) => {
    console.log('Push registration success, token: ' + token.value);
    saveTokenToFirestore(token.value);
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Error on registration: ' + JSON.stringify(error));
  });

  // Show us the notification payload if the app is open on our device
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received: ' + JSON.stringify(notification));
    // You could trigger an in-app toast here
  });

  // Method called when tapping on a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('Push action performed: ' + JSON.stringify(notification));
  });
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
