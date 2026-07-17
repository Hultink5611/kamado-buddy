/**
 * Manual OTA update check (pull-to-refresh). expo-updates normally checks on
 * app launch; this lets the user force a check without restarting. Only does
 * anything in a real build — in Expo Go / dev it reports 'unavailable'.
 */
import * as Updates from 'expo-updates';

export type OTAResult = 'updated' | 'up-to-date' | 'unavailable' | 'error';

/**
 * Check for a newer OTA bundle; if one exists, download it and reload the app
 * into it. Returns 'updated' only if no reload happened (rare); normally the
 * app restarts before returning.
 */
export async function checkAndApplyUpdate(): Promise<OTAResult> {
  // OTA is a no-op in development / Expo Go.
  if (__DEV__ || !Updates.isEnabled) return 'unavailable';
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'up-to-date';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync(); // restarts the app into the new bundle
    return 'updated';
  } catch {
    return 'error';
  }
}
