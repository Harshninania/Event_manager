// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB97tXjS94idnkPXkdd4rBb2WC7Rg0sDgY",
  authDomain: "event-management-website-3c294.firebaseapp.com",
  projectId: "event-management-website-3c294",
  storageBucket: "event-management-website-3c294.firebasestorage.app",
  messagingSenderId: "662300060747",
  appId: "1:662300060747:web:512673ecfb0f23990d31ce",
  measurementId: "G-Q94THGHNEH"
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
