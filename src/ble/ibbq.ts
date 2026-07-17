/**
 * iBBQ / Inkbird BLE protocol (IBT-4XS and family).
 *
 * The IBT-4XS is a pure Bluetooth LE device — no wifi, no cloud API.
 * It speaks the "iBBQ" protocol. To read live temperatures you must:
 *   1. Connect to the peripheral.
 *   2. Write the login/credential bytes to characteristic 0xFFF2.
 *   3. Enable notifications on the realtime characteristic 0xFFF4.
 *   4. Write the "enable realtime data" command to 0xFFF5.
 *   5. Decode 0xFFF4 notifications: 2 bytes little-endian per probe, / 100 = °C.
 *
 * Only ONE BLE central can be connected at a time, so the official Inkbird
 * app must be closed/disconnected while Kamado Buddy is connected.
 *
 * Sources: iBBQ protocol reverse engineering
 *   https://gist.github.com/uucidl/b9c60b6d36d8080d085a8e3310621d64
 *   https://github.com/custom-components/ble_monitor/issues/616
 */

/** 128-bit forms of the 16-bit iBBQ UUIDs (react-native-ble-plx wants full UUIDs). */
const base = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

export const IBBQ = {
  SERVICE: base('fff0'),
  /** Notify: responses to setting commands. */
  SETTINGS_RESULT: base('fff1'),
  /** Write: login / pairing credential. */
  ACCOUNT_VERIFY: base('fff2'),
  /** Notify: history data (unused). */
  HISTORY: base('fff3'),
  /** Notify: realtime temperature data. */
  REALTIME: base('fff4'),
  /** Write: control / settings (enable realtime, set unit, etc). */
  SETTINGS_WRITE: base('fff5'),
} as const;

/** Written to ACCOUNT_VERIFY to authenticate. Fixed for all iBBQ devices. */
export const CREDENTIAL_BYTES = [
  0x21, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0xb8, 0x22, 0x00, 0x00, 0x00,
  0x00, 0x00,
];

/** Written to SETTINGS_WRITE to start realtime temperature notifications. */
export const ENABLE_REALTIME_BYTES = [0x0b, 0x01, 0x00, 0x00, 0x00, 0x00];

/** Set device temperature unit to Celsius. */
export const SET_UNIT_CELSIUS_BYTES = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00];

/**
 * A disconnected probe reports a sentinel. On iBBQ it is 0xFFF6 (raw),
 * which after /100 becomes ~655.3. Anything absurdly high = no probe.
 */
export const PROBE_DISCONNECTED_RAW = 0xfff6;
const IMPLAUSIBLE_C = 600;

/** Advertised local names the IBT-4XS / family use. */
export const DEVICE_NAME_HINTS = ['iBBQ', 'IBT', 'sps', 'Inkbird'];

/** Base64 (what react-native-ble-plx gives you) -> byte array. */
export function base64ToBytes(b64: string): number[] {
  // atob is available in RN Hermes; fall back to Buffer if present.
  const bin =
    typeof atob === 'function'
      ? atob(b64)
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Buffer?.from(b64, 'base64').toString('binary') ?? '';
  const out: number[] = [];
  for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) & 0xff);
  return out;
}

/** Byte array -> base64 (for writing characteristics). */
export function bytesToBase64(bytes: number[]): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b & 0xff);
  if (typeof btoa === 'function') return btoa(bin);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).Buffer?.from(bin, 'binary').toString('base64') ?? '';
}

/**
 * Decode a REALTIME (0xFFF4) notification payload into per-probe °C.
 * Disconnected probes come back as `null`.
 */
export function decodeRealtime(bytes: number[]): (number | null)[] {
  const probes: (number | null)[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const raw = bytes[i] | (bytes[i + 1] << 8);
    if (raw === PROBE_DISCONNECTED_RAW) {
      probes.push(null);
      continue;
    }
    const c = raw / 100;
    probes.push(c > IMPLAUSIBLE_C ? null : Math.round(c * 10) / 10);
  }
  return probes;
}
