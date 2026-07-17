/**
 * Optional AI layer. The live cook logic (targets, timers, steering) is fully
 * local and never depends on this. AI is a convenience:
 *   - identifyMeat(): recognise a cut from a photo/description (Gemini vision).
 *   - coachSteer(): a natural-language nudge from the live numbers.
 *
 * Primary: Google Gemini Flash (free tier, supports vision).
 * Fallback: Groq (free, text-only) when Gemini is unavailable/out of quota.
 * Keys are user-supplied in Settings and stored locally.
 */
import { MEATS } from '../logic/cook';

export interface AIKeys {
  geminiKey?: string;
  groqKey?: string;
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGemini(
  key: string,
  prompt: string,
  imageBase64?: string
): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
  }
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callGroq(key: string, prompt: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

/** Text advice: try Gemini, fall back to Groq. Throws if neither is set. */
export async function coachSteer(keys: AIKeys, context: string): Promise<string> {
  const prompt =
    'Je bent een ervaren kamado-BBQ-coach. Antwoord in het Nederlands, kort en concreet ' +
    '(max 3 zinnen), met een directe tip. Gebruik geen inleiding.\n\n' +
    context;
  if (keys.geminiKey) {
    try {
      return await callGemini(keys.geminiKey, prompt);
    } catch (e) {
      if (!keys.groqKey) throw e;
    }
  }
  if (keys.groqKey) return callGroq(keys.groqKey, prompt);
  throw new Error('Geen AI-sleutel ingesteld');
}

export interface MeatGuess {
  meatId?: string;
  name: string;
  notes: string;
}

/** Photo -> best-matching meat in our DB. Gemini only (needs vision). */
export async function identifyMeat(
  keys: AIKeys,
  imageBase64: string,
  description?: string
): Promise<MeatGuess> {
  if (!keys.geminiKey) throw new Error('Fotoherkenning vereist een Gemini-sleutel');
  const ids = MEATS.map((m) => `${m.id} (${m.name})`).join(', ');
  const prompt =
    'Bekijk deze foto van rauw vlees/vis voor de BBQ' +
    (description ? ` (omschrijving gebruiker: "${description}")` : '') +
    '. Kies de best passende id uit deze lijst: ' +
    ids +
    '. Schat ook de dikte in cm of het gewicht in kg als dat kan. ' +
    'Antwoord ALLEEN als JSON: {"meatId": "...", "name": "...", "thicknessCm": <n of null>, "weightKg": <n of null>, "notes": "korte tip"}';
  const raw = await callGemini(keys.geminiKey, prompt, imageBase64);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { name: 'Onbekend', notes: raw.slice(0, 140) };
  try {
    const parsed = JSON.parse(match[0]);
    return {
      meatId: MEATS.some((m) => m.id === parsed.meatId) ? parsed.meatId : undefined,
      name: parsed.name ?? 'Onbekend',
      notes: parsed.notes ?? '',
    };
  } catch {
    return { name: 'Onbekend', notes: raw.slice(0, 140) };
  }
}
