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
import { slugMeatId } from '../logic/cook';
import type { CookMethod, Meat } from '../logic/types';

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
  /** Set when the photo matches an existing meat in the list. */
  meatId?: string;
  name: string;
  notes: string;
  /** Set when the AI recognised a cut that is NOT in the list yet — ready to add. */
  newMeat?: Meat;
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

/** Build a full Meat from the AI's proposed fields, with safe defaults. */
function buildDiscoveredMeat(name: string, n: Record<string, unknown>): Meat {
  const method = (['direct', 'indirect', 'reverse'] as CookMethod[]).includes(n.method as CookMethod)
    ? (n.method as CookMethod)
    : 'indirect';
  const estimateType = n.estimateType === 'weight' ? 'weight' : 'thickness';
  return {
    id: slugMeatId(name),
    name,
    emoji: (typeof n.emoji === 'string' && n.emoji) || '🍖',
    category: (typeof n.category === 'string' && n.category) || 'Overig',
    method,
    domeTempC: toNum(n.domeTempC, 150),
    coreTempC: n.coreTempC == null ? null : toNum(n.coreTempC, 68),
    flipIntervalMin: n.flipIntervalMin == null ? null : toNum(n.flipIntervalMin, 0) || null,
    estimate: {
      type: estimateType,
      baseMin: toNum(n.baseMin, 30),
      minPerCm: n.minPerCm == null ? undefined : toNum(n.minPerCm, 0),
      minPerKg: n.minPerKg == null ? undefined : toNum(n.minPerKg, 0),
    },
    frozenFactor: toNum(n.frozenFactor, 1.5),
    restMin: toNum(n.restMin, 5),
    temperMin: n.temperMin == null ? 30 : toNum(n.temperMin, 30),
    tips: (typeof n.tips === 'string' && n.tips) || '',
  };
}

/**
 * Photo -> best-matching meat, OR a brand-new meat proposal when the cut isn't
 * in the list yet. Needs a vision model: OpenAI or Gemini.
 */
export async function identifyMeat(
  keys: AIKeys,
  meats: Meat[],
  imageBase64: string,
  description?: string
): Promise<MeatGuess> {
  if (!keys.openaiKey && !keys.geminiKey)
    throw new Error('Fotoherkenning vereist een OpenAI- of Gemini-sleutel');
  const ids = meats.map((m) => `${m.id} (${m.name})`).join(', ');
  const prompt =
    'Bekijk deze foto van rauw vlees/vis voor de BBQ' +
    (description ? ` (omschrijving gebruiker: "${description}")` : '') +
    '. Als het past bij een id uit deze lijst, geef dat id: ' +
    ids +
    '. Past het NERGENS bij, zet dan "meatId" op null en vul "new" met een complete, ' +
    'realistisch geschatte definitie voor dit stuk (BBQ-waarden in °C). ' +
    'Schat ook dikte (cm) of gewicht (kg). Antwoord ALLEEN als JSON: ' +
    '{"meatId": "<id of null>", "name": "...", "thicknessCm": <n of null>, "weightKg": <n of null>, ' +
    '"notes": "korte tip", "new": null of {"emoji":"🍖","category":"...","method":"direct|indirect|reverse",' +
    '"domeTempC":<n>,"coreTempC":<n of null>,"flipIntervalMin":<n of null>,"restMin":<n>,' +
    '"estimateType":"thickness|weight","baseMin":<n>,"minPerCm":<n of null>,"minPerKg":<n of null>,' +
    '"frozenFactor":<n>,"temperMin":<minuten laten temperen voor het erop gaat>,"tips":"korte bereidingstip"}}';

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
    const name = parsed.name ?? 'Onbekend';
    const notes = parsed.notes ?? '';
    if (parsed.meatId && meats.some((m) => m.id === parsed.meatId)) {
      return { meatId: parsed.meatId, name, notes };
    }
    if (parsed.new && typeof parsed.new === 'object') {
      return { name, notes, newMeat: buildDiscoveredMeat(name, parsed.new as Record<string, unknown>) };
    }
    return { name, notes };
  } catch {
    return { name: 'Onbekend', notes: raw.slice(0, 140) };
  }
}
