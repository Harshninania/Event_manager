// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
firebase.initializeApp({
  apiKey: "FCM_API_KEY",
  authDomain: "FCM_PROJECT_ID.firebaseapp.com",
  projectId: "FCM_PROJECT_ID",
  storageBucket: "FCM_PROJECT_ID.appspot.com",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification.body || 'You have a new alert.',
    icon: payload.notification.image || '/logo.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
