import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import {
  IBBQ,
  CREDENTIAL_BYTES,
  ENABLE_REALTIME_BYTES,
  SET_UNIT_CELSIUS_BYTES,
  DEVICE_NAME_HINTS,
  decodeRealtime,
  bytesToBase64,
  base64ToBytes,
} from './ibbq';

export type ConnState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface InkbirdState {
  state: ConnState;
  error?: string;
  deviceName?: string;
  /** Per-probe temperature in °C, null = probe disconnected. */
  channels: (number | null)[];
}

let manager: BleManager | null = null;
function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;
  const perms =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

function looksLikeInkbird(d: Device): boolean {
  const n = (d.name || d.localName || '').toLowerCase();
  return DEVICE_NAME_HINTS.some((h) => n.includes(h.toLowerCase()));
}

export function useInkbird() {
  const [s, setS] = useState<InkbirdState>({ state: 'idle', channels: [] });
  const deviceRef = useRef<Device | null>(null);
  const subRef = useRef<Subscription | null>(null);
  const notifyRef = useRef<Subscription | null>(null);

  const cleanup = useCallback(async () => {
    notifyRef.current?.remove();
    subRef.current?.remove();
    notifyRef.current = null;
    subRef.current = null;
    if (deviceRef.current) {
      try {
        await getManager().cancelDeviceConnection(deviceRef.current.id);
      } catch {
        /* already gone */
      }
      deviceRef.current = null;
    }
  }, []);

  const startRealtime = useCallback(async (device: Device) => {
    await device.discoverAllServicesAndCharacteristics();
    // Authenticate.
    await device.writeCharacteristicWithResponseForService(
      IBBQ.SERVICE,
      IBBQ.ACCOUNT_VERIFY,
      bytesToBase64(CREDENTIAL_BYTES)
    );
    // Force Celsius on the device (harmless if already C).
    await device
      .writeCharacteristicWithResponseForService(
        IBBQ.SERVICE,
        IBBQ.SETTINGS_WRITE,
        bytesToBase64(SET_UNIT_CELSIUS_BYTES)
      )
      .catch(() => {});
    // Subscribe to realtime notifications.
    notifyRef.current = device.monitorCharacteristicForService(
      IBBQ.SERVICE,
      IBBQ.REALTIME,
      (err, char) => {
        if (err || !char?.value) return;
        const bytes = base64ToBytes(char.value);
        const channels = decodeRealtime(bytes);
        setS((prev) => ({ ...prev, state: 'connected', channels }));
      }
    );
    // Kick off realtime stream.
    await device.writeCharacteristicWithResponseForService(
      IBBQ.SERVICE,
      IBBQ.SETTINGS_WRITE,
      bytesToBase64(ENABLE_REALTIME_BYTES)
    );
  }, []);

  const connect = useCallback(
    async (device: Device) => {
      setS((p) => ({ ...p, state: 'connecting', error: undefined }));
      try {
        const connected = await device.connect({ requestMTU: 64 });
        deviceRef.current = connected;
        subRef.current = connected.onDisconnected(() => {
          setS((p) => ({ ...p, state: 'idle' }));
        });
        setS((p) => ({ ...p, deviceName: connected.name || 'Inkbird' }));
        await startRealtime(connected);
      } catch (e) {
        setS((p) => ({ ...p, state: 'error', error: String(e) }));
      }
    },
    [startRealtime]
  );

  const scanAndConnect = useCallback(async () => {
    if (!(await ensurePermissions())) {
      setS((p) => ({ ...p, state: 'error', error: 'Bluetooth-permissie geweigerd' }));
      return;
    }
    setS((p) => ({ ...p, state: 'scanning', error: undefined }));
    const m = getManager();
    let done = false;
    const stop = () => {
      if (!done) {
        done = true;
        m.stopDeviceScan();
      }
    };
    const timeout = setTimeout(() => {
      stop();
      setS((p) =>
        p.state === 'scanning'
          ? { ...p, state: 'error', error: 'Geen Inkbird gevonden. Staat de meter aan en is de Inkbird-app dicht?' }
          : p
      );
    }, 15000);

    m.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) {
        stop();
        clearTimeout(timeout);
        setS((p) => ({ ...p, state: 'error', error: String(err) }));
        return;
      }
      if (device && looksLikeInkbird(device)) {
        stop();
        clearTimeout(timeout);
        connect(device);
      }
    });
  }, [connect]);

  const disconnect = useCallback(async () => {
    await cleanup();
    setS({ state: 'idle', channels: [] });
  }, [cleanup]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return { ...s, scanAndConnect, disconnect };
}
