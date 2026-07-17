import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let configured = false;

export async function setupNotifications(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alarms', {
      name: 'Kamado alarmen',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('status', {
      name: 'Cook status',
      importance: Notifications.AndroidImportance.LOW,
    });
  }
  configured = true;
  return status === 'granted';
}

export async function fireAlarm(title: string, body: string): Promise<void> {
  if (!configured) await setupNotifications();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default' },
    trigger: null,
    // @ts-expect-error android-only channel field
    channelId: 'alarms',
  });
}

/**
 * Persistent "cook active" notification. Keeps the cook visible while the app
 * is backgrounded. NOTE: a true always-on foreground service that survives the
 * app being swept from memory needs a small native module; this ongoing
 * notification + BLE background mode covers the normal "app in background /
 * screen off" case. See README > Known limitations.
 */
let statusId: string | null = null;

export async function showCookStatus(text: string): Promise<void> {
  if (!configured) await setupNotifications();
  if (statusId) await Notifications.dismissNotificationAsync(statusId).catch(() => {});
  statusId = await Notifications.scheduleNotificationAsync({
    content: { title: '🔥 Kamado Buddy actief', body: text, sticky: true },
    trigger: null,
    // @ts-expect-error android-only channel field
    channelId: 'status',
  });
}

export async function clearCookStatus(): Promise<void> {
  if (statusId) {
    await Notifications.dismissNotificationAsync(statusId).catch(() => {});
    statusId = null;
  }
}
