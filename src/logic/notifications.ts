import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * The ongoing "cook active" status notification updates every few seconds. It
 * must stay SILENT (no banner, no sound) — only real alarms should alert. We
 * tag notifications with data.kind and let the handler decide presentation.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const kind = (notification.request.content.data as { kind?: string } | undefined)?.kind;
    if (kind === 'status') {
      // Silent ongoing status — visible in the list, but no pop / no sound.
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    // Alarms and everything else: alert + sound.
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
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
    content: { title, body, sound: 'default', data: { kind: 'alarm' } },
    trigger: null,
    // @ts-expect-error android-only channel field
    channelId: 'alarms',
  });
}

/**
 * Persistent "cook active" notification. Keeps the cook visible while the app
 * is backgrounded. Uses a STABLE identifier so repeated updates replace the
 * same notification silently (instead of stacking / re-alerting each tick).
 */
const STATUS_ID = 'kamado-cook-status';
let lastStatusText: string | null = null;

export async function showCookStatus(text: string): Promise<void> {
  if (!configured) await setupNotifications();
  if (text === lastStatusText) return; // niets veranderd -> niet opnieuw posten
  lastStatusText = text;
  await Notifications.scheduleNotificationAsync({
    identifier: STATUS_ID,
    content: { title: '🔥 Kamado Buddy actief', body: text, sticky: true, data: { kind: 'status' } },
    trigger: null,
    // @ts-expect-error android-only channel field
    channelId: 'status',
  });
}

export async function clearCookStatus(): Promise<void> {
  lastStatusText = null;
  await Notifications.dismissNotificationAsync(STATUS_ID).catch(() => {});
}
