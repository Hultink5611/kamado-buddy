# 🔥 Kamado Buddy

Android-app voor een kleine kamado (GrillMeister mini) die je **Inkbird IBT-4XS** uitleest, je vertelt **hoe warm het moet** voor je stuk vlees, live meestuurt op **klepstanden en kolen**, en alles bijhoudt in een **grafiek + logboek**.

De harde kern (doeltemps, timers, klepadvies) draait **100% lokaal en offline** — geen internet nodig bij de BBQ. AI is een optionele extra.

## Wat het doet

- **Inkbird IBT-4XS via Bluetooth** — leest tot 4 probes rechtstreeks uit (iBBQ-protocol). Eén probe = omgeving (clip op het rooster), één = vlees.
- **Vlees kiezen** → doel-kerntemp, methode (direct/indirect/reverse sear), doel-koepeltemp, tijdschatting en draai-interval. Optioneel foto (AI herkent 't vlees) en gewicht/dikte.
- **Live grafiek** (Liveline-stijl, Skia) van vlees + omgeving met doellijnen.
- **Klep- & kolenadvies** — meesturend: vergelijkt omgevingstemp met doel en geeft concrete duwtjes (“knijp bovenklep naar half open, wacht 10 min”). Houdt rekening met de traagheid van een kamado.
- **Zelflerend** — onthoudt welke klepstanden bij jouw grill een stabiele temp gaven en gebruikt die voortaan als startpunt. Plus een **kalibratie-modus** om dat bewust te doen.
- **Timers** — automatische draai-timer, totaal-kooktimer en vrije timers (“kaas erop over 2 min”).
- **Alarmen** — kerntemp bereikt, kamado buiten ± marge, probe losgeraakt. Werken ook met scherm uit ( blijvende notificatie).
- **Logboek** — elke cook opgeslagen met grafiek, lokaal (SQLite). Exporteren naar JSON.

## Belangrijk over de Inkbird

De IBT-4XS heeft **geen wifi en geen cloud/API** — “wireless” = Bluetooth LE naar je telefoon. Er kan maar **één app tegelijk** met de meter verbinden, dus **sluit de originele Inkbird-app** voordat je Kamado Buddy verbindt. Deze app vervangt die app.

Protocol (iBBQ), voor wie 't wil weten: service `0xFFF0`, login-bytes naar `0xFFF2`, realtime aanzetten via `0xFFF5`, temps binnen op `0xFFF4` (2 bytes little-endian per probe, ÷100 = °C). Zie `src/ble/ibbq.ts`.

## Draaien op je telefoon

BLE werkt **niet** in Expo Go — je hebt een **dev-build** nodig.

### Optie A — EAS build in de cloud (geen Android Studio nodig)
```bash
npm install
npm install -g eas-cli
eas login
eas build --profile development --platform android
```
Installeer de APK die je krijgt, dan:
```bash
npm start        # start de dev-server
```
Open de app op je telefoon en scan de QR.

### Optie B — lokaal bouwen (Android Studio + USB)
```bash
npm install
npm run android  # prebuild + build + installeer op aangesloten toestel
```

## AI instellen (optioneel)
In de app: **Instellingen → AI**. Plak een gratis sleutel:
- **Gemini** (foto + tekst): https://aistudio.google.com/apikey
- **Groq** (tekst-fallback): https://console.groq.com/keys

Zonder sleutels werkt alles behalve fotoherkenning en de AI-coach.

## Eerste keer gebruiken
1. Sluit de Inkbird-app. Zet de meter aan.
2. Home → **Verbind Inkbird**.
3. **Nieuwe cook** → kies vlees → **Start**.
4. Clip één probe op het rooster (omgeving), steek één in het vlees. Wijs de kanalen toe op het live-scherm.
5. Volg het klepadvies, draai op de timer, wacht op het kern-alarm.

## Known limitations
- De blijvende notificatie + BLE-achtergrondmodus dekken “app in de achtergrond / scherm uit”. Een echte foreground-service die overleeft als Android de app volledig uit het geheugen veegt, vraagt een klein native module — staat op de v2-lijst.
- Klep-defaults zijn generiek; ze worden pas echt goed nadat de app jouw grill een paar keer heeft geleerd.
- Kerntemps volgen USDA-veiligheidsminima + gangbare BBQ-praktijk; controleer bij twijfel altijd zelf.

## Structuur
```
src/
  ble/        Inkbird iBBQ-protocol + BLE-hook
  data/       meats.json (kerntemps), ventGuide.json (klepdefaults)
  logic/      cook/steering/learning/notifications
  ai/         Gemini + Groq
  storage/    SQLite
  components/ grafiek, tegels, timers, klepadvies
  screens/    Home, NewCook, Cook, Logbook, Calibration, Settings
```

## v2-ideeën
iPhone-versie · cloud-sync/delen · ventilator-controller voor volautomatisch regelen · echte foreground-service.

---
Gebouwd voor Mrk's GrillMeister mini. Data-bronnen: USDA FSIS, AmazingRibs, Weber.
