import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Seu navegador nao suporta Service Worker.');
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration) {
    throw new Error('Service Worker nao esta pronto.');
  }

  return registration;
}

export async function subscribeForPushNotifications(userId: string, familyId: string) {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push notification nao suportada neste dispositivo.');
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VITE_VAPID_PUBLIC_KEY nao configurada.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissao de notificacao negada.');
  }

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error('Falha ao ler a inscricao de push.');
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      family_id: familyId,
      user_id: userId,
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
      user_agent: navigator.userAgent,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function unsubscribeFromPushNotifications() {
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    throw new Error(error.message);
  }

  await subscription.unsubscribe();
}

export async function hasActivePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
}

export async function triggerFamilyPushNotification(
  familyId: string,
  title: string,
  body: string,
  excludeUserId?: string
) {
  const { error } = await supabase.functions.invoke('send-web-push', {
    body: {
      familyId,
      title,
      body,
      excludeUserId,
      data: {
        url: '/?screen=notifications',
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}
