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
import { slugMeatId, sanitizeMeat } from '../logic/cook';
import type { CookMethod, Meat } from '../logic/types';

export interface AIKeys {
  openaiKey?: string;
  geminiKey?: string;
  groqKey?: string;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o'; // sterker tekstmodel voor coaching + marinades
const OPENAI_VISION_MODEL = 'gpt-4o'; // sterker in vlees-/vissnit-herkenning
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
          image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'high' },
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
      // Use the stronger vision model when there's an image.
      model: imageBase64 ? OPENAI_VISION_MODEL : OPENAI_MODEL,
      messages: [{ role: 'user', content }],
      temperature: 0.2,
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
  return textChain(keys, prompt);
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
  return sanitizeMeat({
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
    story: (typeof n.story === 'string' && n.story) || undefined,
  });
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
    'Je bent een slager/BBQ-expert. Identificeer het EXACTE stuk vlees of vis op de foto, ' +
    'in het Nederlands en zo specifiek mogelijk qua snit (denk aan: buikspek, procureur, ' +
    'picanha, entrecote, spareribs, kipdij, zalmfilet, enz.). Let op vorm, vetdek, vezels en kleur — ' +
    'verwar snitten niet (buikspek is bijv. GEEN kotelet).' +
    (description ? ` De gebruiker omschrijft het als: "${description}".` : '') +
    ' Kies alléén een id uit deze lijst als het ECHT exact dezelfde snit is: ' +
    ids +
    '. Twijfel je, of is het een andere snit? Zet dan "meatId" op null en vul "new" met een ' +
    'complete, realistisch geschatte definitie voor dit specifieke stuk (BBQ-waarden in °C, ' +
    'gebruik de juiste Nederlandse naam van de snit als "name"). ' +
    'Schat ook dikte (cm) of gewicht (kg). ' +
    'BELANGRIJK bij de tijdschatting (baseMin/minPerCm/minPerKg): wees realistisch. ' +
    'Dunne stukken (steaks, koteletten, filets van 1-3 cm) zijn direct in 8-15 min TOTAAL klaar ' +
    '(baseMin 4-6, minPerCm 2-3) — niet 30-40 min. Alleen grote stukken (hele kip, rollade) of ' +
    'low & slow (schouder, ribs, brisket) duren lang. ' +
    'Antwoord ALLEEN als JSON: ' +
    '{"meatId": "<id of null>", "name": "...", "thicknessCm": <n of null>, "weightKg": <n of null>, ' +
    '"notes": "korte tip", "new": null of {"emoji":"🍖","category":"...","method":"direct|indirect|reverse",' +
    '"domeTempC":<n>,"coreTempC":<n of null>,"flipIntervalMin":<n of null>,"restMin":<n>,' +
    '"estimateType":"thickness|weight","baseMin":<n>,"minPerCm":<n of null>,"minPerKg":<n of null>,' +
    '"frozenFactor":<n>,"temperMin":<minuten laten temperen voor het erop gaat>,"tips":"korte bereidingstip",' +
    '"story":"2-3 zinnen hoe de meeste kamado-BBQ\'ers dit stuk bereiden, gebaseerd op gangbare praktijk ' +
    '(AmazingRibs/Weber-stijl kennis): deksel open of dicht, mét of zónder deflector/plaatsteen, ' +
    'welk temperatuurbereik, en hoe vaak keren. Bijv.: \\"De meesten grillen dit direct zonder deflector ' +
    'rond 180-220°C met de deksel dicht en keren 2x.\\""}}';

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

/**
 * Photo -> just the Dutch cut name (for the temperature guide). Lightweight
 * variant of identifyMeat: no full meat definition, only the name.
 */
export async function identifyCutName(keys: AIKeys, imageBase64: string): Promise<string> {
  if (!keys.openaiKey && !keys.geminiKey)
    throw new Error('Fotoherkenning vereist een OpenAI- of Gemini-sleutel');
  const prompt =
    'Identificeer het stuk vlees, vis of groente op de foto. Antwoord ALLEEN met de Nederlandse naam ' +
    'van de snit, zo specifiek mogelijk (bijv. "bavette", "kipdij", "buikspek", "zalmfilet", "paprika"). ' +
    'Geen andere tekst, geen zin — alleen de naam.';
  const vision: Array<() => Promise<string>> = [];
  if (keys.openaiKey) vision.push(() => callOpenAI(keys.openaiKey!, prompt, imageBase64));
  if (keys.geminiKey) vision.push(() => callGemini(keys.geminiKey!, prompt, imageBase64));
  let lastErr: unknown;
  for (const run of vision) {
    try {
      const raw = await run();
      const name = raw.trim().split('\n')[0].replace(/["'.]/g, '').trim();
      if (name) return name;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Fotoherkenning mislukt');
}

export interface MarinadeSuggestion {
  name: string;
  amount: string;
  ingredients: string;
  method: string;
}

/** Run a text prompt through the provider chain (OpenAI → Gemini → Groq). */
async function textChain(keys: AIKeys, prompt: string): Promise<string> {
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
      lastErr = e; // e.g. Gemini 429 -> volgende provider
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI mislukt');
}

/**
 * Let the AI invent a marinade for a given cut. Tries OpenAI → Gemini → Groq.
 * Optional `style` (e.g. "Surinaamse") steers the cuisine — used for random marinades.
 */
export async function suggestMarinade(keys: AIKeys, cut: string, style?: string): Promise<MarinadeSuggestion> {
  const prompt =
    `Bedenk één lekkere, verrassende marinade${style ? ` in ${style} stijl` : ''} voor "${cut}" op de kamado-BBQ. ` +
    `Geef concrete ingrediënten met hoeveelheden en vermeld voor HOEVEEL "${cut}" die hoeveelheden precies zijn (aantal stuks én geschat gewicht). ` +
    'De methode moet óók duidelijk maken HOE je het op de kamado bereidt: direct op het rooster, in een aluminium pakketje, op een grillplaat/plancha of aan spiesen — kies wat het beste past bij dit stuk — plus de zone/temperatuur en de marineertijd. ' +
    `Antwoord ALLEEN als JSON: {"name":"korte pakkende naam","amount":"voor hoeveel ${cut}, bijv. \\"4 stuks (~500 g)\\"","ingredients":"ingredient 1\\ningredient 2\\n...","method":"hoe marineren + marineertijd + hoe grillen op de kamado (folie/rooster/grillplaat/spies)"}`;
  const raw = await textChain(keys, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      return {
        name: p.name ?? `Marinade voor ${cut}`,
        amount: p.amount ?? '',
        ingredients: p.ingredients ?? '',
        method: p.method ?? '',
      };
    } catch {
      /* fall through to raw */
    }
  }
  return { name: `Marinade voor ${cut}`, amount: '', ingredients: raw.trim(), method: '' };
}

export interface MarinadeSearchResult extends MarinadeSuggestion {
  /** The cut the recipe belongs to, e.g. "Kip" — matched to the meat list when possible. */
  forMeat: string;
}

/**
 * Free-text recipe search, e.g. "pittige Surinaamse kip" → a fitting marinade.
 * `cuts` are the known meats/vegetables so the AI can link the recipe to one.
 */
export async function searchMarinade(
  keys: AIKeys,
  query: string,
  cuts: string[]
): Promise<MarinadeSearchResult> {
  const prompt =
    `De gebruiker zoekt een BBQ-marinade-recept: "${query}".\n` +
    'Geef het best passende, authentieke recept voor op de kamado-BBQ. ' +
    `Gaat het om een van deze stukken, gebruik dan die EXACTE naam als "forMeat": ${cuts.join(', ')}. ` +
    'Anders vul je zelf het stuk vlees of de groente in. ' +
    'Geef concrete ingrediënten met hoeveelheden en vermeld voor HOEVEEL stuks (én geschat gewicht) die hoeveelheden zijn. ' +
    'De methode moet óók duidelijk maken HOE je het op de kamado bereidt: direct op het rooster, in een aluminium pakketje, op een grillplaat/plancha of aan spiesen — plus zone/temperatuur en marineertijd. ' +
    'Antwoord ALLEEN als JSON: {"name":"korte pakkende naam","forMeat":"stuk vlees of groente","amount":"voor hoeveel, bijv. \\"4 kipdijen (~600 g)\\"","ingredients":"ingredient 1\\ningredient 2\\n...","method":"hoe marineren + marineertijd + hoe grillen op de kamado (folie/rooster/grillplaat/spies)"}';
  const raw = await textChain(keys, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      return {
        name: p.name ?? query,
        forMeat: p.forMeat ?? '',
        amount: p.amount ?? '',
        ingredients: p.ingredients ?? '',
        method: p.method ?? '',
      };
    } catch {
      /* fall through to raw */
    }
  }
  return { name: query, forMeat: '', amount: '', ingredients: raw.trim(), method: '' };
}

/**
 * Fill the gaps of an EXISTING recipe without changing the ingredients:
 *  - a clear "voor hoeveel" for the specific cut (aantal stuks + gewicht);
 *  - a complete kamado prep method (folie / rooster / grillplaat / spies).
 */
export async function enrichMarinade(
  keys: AIKeys,
  m: { name: string; forMeat?: string; amount?: string; ingredients: string; method?: string }
): Promise<{ amount: string; method: string }> {
  const prompt =
    `Vul deze bestaande BBQ-marinade aan ZONDER de ingrediënten te wijzigen.\n` +
    `Naam: "${m.name}"${m.forMeat ? ` (voor ${m.forMeat})` : ''}.\n` +
    `Ingrediënten:\n${m.ingredients}\n` +
    (m.amount ? `Huidige "voor hoeveel"-notitie: ${m.amount}\n` : '') +
    (m.method ? `Huidige methode: ${m.method}\n` : '') +
    `Geef twee dingen terug:\n` +
    `1) "amount": voor hoeveel ${m.forMeat || 'stuks'} deze hoeveelheden precies bedoeld zijn — aantal stuks én geschat gewicht.\n` +
    `2) "method": een complete bereiding op de kamado-BBQ: hoe aanmaken + marineertijd, en HOE je het grilt — direct op het rooster, in een aluminium pakketje, op een grillplaat/plancha of aan spiesen (kies wat het beste past), met de juiste zone/temperatuur.\n` +
    `Antwoord ALLEEN als JSON: {"amount":"...","method":"..."}`;
  const raw = await textChain(keys, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      return { amount: p.amount ?? m.amount ?? '', method: p.method ?? m.method ?? '' };
    } catch {
      /* fall through */
    }
  }
  throw new Error('Kon het antwoord niet lezen');
}

/**
 * Spar over the current marinade: substitutions ("geen sesamolie — wat nu?"),
 * tweaks, pairing questions. The marinade + chat history travel along as
 * context so follow-up questions work.
 */
export async function marinadeChat(
  keys: AIKeys,
  m: { name: string; forMeat?: string; amount?: string; ingredients: string; method?: string },
  history: { role: 'user' | 'ai'; text: string }[],
  question: string
): Promise<string> {
  const conv = history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Gebruiker' : 'Jij'}: ${h.text}`)
    .join('\n');
  const prompt =
    `Je bent een ervaren BBQ-marinade-expert. De gebruiker werkt aan deze marinade:\n` +
    `Naam: ${m.name || 'naamloos'}${m.forMeat ? ` (voor ${m.forMeat})` : ''}\n` +
    (m.amount ? `Voor: ${m.amount}\n` : '') +
    `Ingrediënten:\n${m.ingredients || '(nog leeg)'}\n` +
    (m.method ? `Methode: ${m.method}\n` : '') +
    (conv ? `\nEerder in dit gesprek:\n${conv}\n` : '') +
    `\nNieuwe vraag van de gebruiker: ${question}\n\n` +
    `Antwoord in het Nederlands, kort en praktisch (max 4 zinnen). Geef bij vervangers concrete ` +
    `verhoudingen (bijv. "vervang 1 el sesamolie door 1 el neutrale olie + 1 tl geroosterd sesamzaad"). Geen inleiding.`;
  return textChain(keys, prompt);
}

/** Rescale a marinade's ingredient amounts to a new quantity (AI-aware: spices sub-linear). */
export async function scaleMarinade(
  keys: AIKeys,
  m: { name: string; forMeat?: string; amount?: string; ingredients: string; method?: string; target: string }
): Promise<{ amount: string; ingredients: string; method: string }> {
  const prompt =
    `Herbereken deze BBQ-marinade naar een andere hoeveelheid.\n` +
    `Naam: "${m.name}"${m.forMeat ? ` (voor ${m.forMeat})` : ''}.\n` +
    `Huidige hoeveelheden zijn voor: ${m.amount || 'onbekend'}.\n` +
    `Schaal naar: ${m.target}.\n` +
    `Belangrijk: olie, zuur (azijn/citrus), sojasaus en andere vloeistoffen schaal je ongeveer recht evenredig. ` +
    `Kruiden, zout, chili, peper en knoflook schaal je SUB-lineair (minder dan evenredig) zodat het niet te heftig wordt. ` +
    `Rond af op praktische keukenmaten (theelepel/eetlepel/teentjes).\n` +
    `Behoud in de methode de bereiding: hoe marineren + marineertijd én hoe grillen op de kamado (folie/rooster/grillplaat/spies).\n` +
    `Antwoord ALLEEN als JSON: {"amount":"${m.target} (met geschat gewicht)","ingredients":"ingredient 1\\ningredient 2\\n...","method":"hoe marineren + marineertijd + hoe grillen op de kamado"}`;
  const raw = await textChain(keys, prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      return {
        amount: p.amount ?? m.target,
        ingredients: p.ingredients ?? m.ingredients,
        method: p.method ?? m.method ?? '',
      };
    } catch {
      /* fall through */
    }
  }
  throw new Error('Kon het antwoord niet lezen');
}
