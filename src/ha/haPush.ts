/**
 * Push live cook data to Home Assistant via the REST API, so the Thuishub
 * dashboard (Tab S11) can show it. Zero extra hardware: the phone is the BLE
 * reader and posts states over wifi/Tailscale to HA.
 *
 * POST /api/states/<entity_id> upserts a state (and creates the entity if it
 * doesn't exist yet). Configure base URL + long-lived token in Settings.
 */
import type { SteerAdvice } from '../logic/steering';

export interface HAConfig {
  url?: string; // e.g. http://192.168.178.10:8123 of de Tailscale-URL
  token?: string; // HA long-lived access token
}

export interface HAPayload {
  meatName: string;
  ambientC: number | null;
  meatC: number | null;
  targetDomeC: number;
  targetCoreC: number | null;
  advice: SteerAdvice;
  active: boolean;
}

const ENTITY = {
  ambient: 'sensor.kamado_omgeving',
  meat: 'sensor.kamado_vlees',
  targetDome: 'sensor.kamado_doel_bbq',
  targetCore: 'sensor.kamado_doel_kern',
  advice: 'sensor.kamado_klepadvies',
  meatName: 'sensor.kamado_gerecht',
  active: 'binary_sensor.kamado_actief',
} as const;

async function postState(
  cfg: HAConfig,
  entityId: string,
  state: string | number,
  attributes: Record<string, unknown>
): Promise<void> {
  if (!cfg.url || !cfg.token) return;
  const base = cfg.url.replace(/\/+$/, '');
  await fetch(`${base}/api/states/${entityId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state: String(state), attributes }),
  });
}

/** Fire-and-forget push van de hele cook-snapshot. Gooit nooit. */
export async function pushToHA(cfg: HAConfig, p: HAPayload): Promise<void> {
  if (!cfg.url || !cfg.token) return;
  try {
    await Promise.all([
      postState(cfg, ENTITY.ambient, p.ambientC ?? 'unknown', {
        unit_of_measurement: '°C', device_class: 'temperature',
        friendly_name: 'Grillmeister omgeving', icon: 'mdi:grill',
      }),
      postState(cfg, ENTITY.meat, p.meatC ?? 'unknown', {
        unit_of_measurement: '°C', device_class: 'temperature',
        friendly_name: 'Grillmeister vlees', icon: 'mdi:food-steak',
      }),
      postState(cfg, ENTITY.targetDome, p.targetDomeC, {
        unit_of_measurement: '°C', friendly_name: 'Grillmeister doel BBQ',
      }),
      postState(cfg, ENTITY.targetCore, p.targetCoreC ?? 'unknown', {
        unit_of_measurement: '°C', friendly_name: 'Grillmeister doel kern',
      }),
      postState(cfg, ENTITY.advice, p.advice.headline, {
        friendly_name: 'Grillmeister klepadvies',
        detail: p.advice.detail, status: p.advice.status,
        onderschuif: p.advice.suggestedBottom, bovenklep: p.advice.suggestedTop,
        kolen: p.advice.coalFill, icon: 'mdi:tune-vertical',
      }),
      postState(cfg, ENTITY.meatName, p.meatName, { friendly_name: 'Grillmeister gerecht' }),
      postState(cfg, ENTITY.active, p.active ? 'on' : 'off', {
        friendly_name: 'Grillmeister actief', device_class: 'running',
      }),
    ]);
  } catch {
    /* offline / HA onbereikbaar — negeren, live-logica is toch lokaal */
  }
}

/**
 * One-off connectivity check for the Settings screen. Tells the user exactly
 * why the dashboard stays empty (bad token, wrong URL, unreachable, …).
 */
export async function testHA(cfg: HAConfig): Promise<{ ok: boolean; detail: string }> {
  if (!cfg.url || !cfg.token) return { ok: false, detail: 'Vul eerst een HA-URL én token in.' };
  const base = cfg.url.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/`, {
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      return { ok: true, detail: "Verbonden! HA reageert. Start een cook en tik 'Vlees ligt erop' — de sensoren verschijnen dan in HA en op je dashboard." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: `HTTP ${res.status} — token ongeldig of verlopen. Maak een nieuw long-lived token aan in HA (Profiel → Beveiliging).` };
    }
    return { ok: false, detail: `HTTP ${res.status} — HA gevonden maar antwoordt onverwacht. Controleer de URL (incl. http/https en poort 8123).` };
  } catch (e) {
    return {
      ok: false,
      detail: `Niet bereikbaar (${String(e)}). Klopt de URL, en kan je telefoon HA bereiken (zelfde wifi, of via Tailscale/Nabu Casa)?`,
    };
  }
}

/** Zet de cook op afgerond (kaart gaat uit). */
export async function pushCookEnded(cfg: HAConfig): Promise<void> {
  if (!cfg.url || !cfg.token) return;
  try {
    await postState(cfg, ENTITY.active, 'off', {
      friendly_name: 'Grillmeister actief', device_class: 'running',
    });
  } catch { /* ignore */ }
}
