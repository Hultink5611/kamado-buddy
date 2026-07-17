/**
 * Optional AI layer. The live cook logic (targets, timers, steering) is fully
 * local and never depends on this. AI is a convenience:
 *   - identifyMeat(): recognise a cut from a photo/description (Gemini vision).
 *   - coachSteer(): a natural-language nudge from the live numbers.
 *
 * Providers (tried in this order, whichever keys are set):
 *   1. OpenAI GPT-4o mini (paid, reliable, supports vision).
 *   2. Google Gemini Flash (free tier, supports vision — can hit 429 quota).
 *   3. Groq (free, text-only) — text fallback.
 * On any error (e.g. Gemini 429) we fall through to the next available
 * provider. Keys are user-supplied in Settings and stored locally.
 */
import { MEATS } from '../logic/cook';

export interface AIKeys {
  openaiKey?: string;
  geminiKey?: string;
  groqKey?: string;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini'; // cheap, supports vision
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callOpenAI(
  key: string,
  prompt: string,
  imageBase64?: string
): Promise<string> {
  // Vision needs the multi-part content form; text-only can stay a string.
  const content = imageBase64
    ? [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
        },
      ]
    : prompt;
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

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

/** Text advice: try OpenAI, then Gemini, then Groq. Throws if none is set. */
export async function coachSteer(keys: AIKeys, context: string): Promise<string> {
  const prompt =
    'Je bent een ervaren kamado-BBQ-coach. Antwoord in het Nederlands, kort en concreet ' +
    '(max 3 zinnen), met een directe tip. Gebruik geen inleiding.\n\n' +
    context;
  const providers: Array<() => Promise<string>> = [];
  if (keys.openaiKey) providers.push(() => callOpenAI(keys.openaiKey!, prompt));
  if (keys.geminiKey) providers.push(() => callGemini(keys.geminiKey!, prompt));
  if (keys.groqKey) providers.push(() => callGroq(keys.groqKey!, prompt));
  if (providers.length === 0) throw new Error('Geen AI-sleutel ingesteld');

  let lastErr: unknown;
  for (const run of providers) {
    try {
      return await run();
    } catch (e) {
      lastErr = e; // e.g. Gemini 429 -> val door naar de volgende provider
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI mislukt');
}

export interface MeatGuess {
  meatId?: string;
  name: string;
  notes: string;
}

/** Photo -> best-matching meat in our DB. Needs a vision model: OpenAI or Gemini. */
export async function identifyMeat(
  keys: AIKeys,
  imageBase64: string,
  description?: string
): Promise<MeatGuess> {
  if (!keys.openaiKey && !keys.geminiKey)
    throw new Error('Fotoherkenning vereist een OpenAI- of Gemini-sleutel');
  const ids = MEATS.map((m) => `${m.id} (${m.name})`).join(', ');
  const prompt =
    'Bekijk deze foto van rauw vlees/vis voor de BBQ' +
    (description ? ` (omschrijving gebruiker: "${description}")` : '') +
    '. Kies de best passende id uit deze lijst: ' +
    ids +
    '. Schat ook de dikte in cm of het gewicht in kg als dat kan. ' +
    'Antwoord ALLEEN als JSON: {"meatId": "...", "name": "...", "thicknessCm": <n of null>, "weightKg": <n of null>, "notes": "korte tip"}';

  // Vision-capable providers, in preference order; fall through on error.
  const vision: Array<() => Promise<string>> = [];
  if (keys.openaiKey) vision.push(() => callOpenAI(keys.openaiKey!, prompt, imageBase64));
  if (keys.geminiKey) vision.push(() => callGemini(keys.geminiKey!, prompt, imageBase64));
  let raw = '';
  let lastErr: unknown;
  for (const run of vision) {
    try {
      raw = await run();
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!raw) throw lastErr instanceof Error ? lastErr : new Error('Fotoherkenning mislukt');
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
