self.addEventListener('push', (event) => {
  let payload = {
    title: 'PetFamily',
    body: 'Voce tem uma nova notificacao.',
    data: {
      url: '/?screen=notifications',
    },
  };

  try {
    if (event.data) {
      payload = {
        ...payload,
        ...event.data.json(),
      };
    }
  } catch {
    // Keep default payload if parsing fails.
  }

  const options = {
    body: payload.body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    data: payload.data || { url: '/?screen=notifications' },
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'PetFamily', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || '/?screen=notifications';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        const sameClient = clientsArr.find((client) => 'focus' in client);

        if (sameClient) {
          sameClient.navigate(targetUrl);
          return sameClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      })
  );
});
