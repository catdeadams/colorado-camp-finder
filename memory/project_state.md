---
name: camping-app-project-state
description: Current build state of the Colorado Camp Finder app — what's done, what's next
metadata:
  type: project
---

Colorado Camp Finder is a Next.js 14 app in `C:\Users\catad\Documents\Local Coding - Docs\colorado-camping-finder`.

**Why:** User wanted a personal camping search tool pulling from multiple sources with offline capability and availability alerts. Answers: Colorado-only, mobile+web+desktop, small group (family/friends), availability-first search.

**How to apply:** Continue building phases below in order. Always verify with `npm run build` before calling a phase done.

## Completed phases

### Phase 1 — Core web app
- Next.js 14 + TypeScript + Tailwind + MapLibre map
- rec.gov RIDB API search + availability check
- Sidebar: search form, results list sorted by availability then distance
- Map with colored pins (green/amber/red/gray), popups, reserve links, directions

### Phase 2 — More sources + alerts
- Colorado State Parks via ReserveAmerica (unofficial API, tries 2 hosts for reliability)
- FreeCampsites.net (first-come/dispersed free sites)
- Deduplication across sources by coordinate proximity + name similarity
- Alert/watch system: save a watch for a full campground → email alert when it opens
- Email via nodemailer/Gmail (requires ALERT_EMAIL + ALERT_EMAIL_PASSWORD in .env.local)
- Watches tab in sidebar, bell icon on full campground cards
- `/api/watches` (CRUD), `/api/check-alerts` (POST to trigger), `scripts/check-alerts.mjs`

### Phase 3 — More data sources
- The Dyrt integration (tries radius then bounding-box API, graceful fallback)
- iOverlander integration (overland/dispersed community spots)
- Source toggle filter in search form (5 sources, collapsible checkboxes)
- Per-source hit counts shown in results bar after search
- Hipcamp deep-link card at bottom of results (not scraped — redirects to their site with dates/location)
- Improved dedup (strips noise words like "campground", "state", etc.)
- CPW now tries two hosts for reliability

## Env vars needed
- `RECGOV_API_KEY` — free key from ridb.recreation.gov (required for rec.gov search)
- `ALERT_EMAIL` — Gmail address for sending alerts
- `ALERT_EMAIL_PASSWORD` — Gmail App Password (16-char, from Google Account security)

## Next phases to build
- **Dispersed camping** — BLM/USFS public land overlay on map, dispersed spot suggestions with terrain flatness score and road access type
- **Offline maps** — tile region download, spot bubble pre-cache, GPS position display (needs mobile/Capacitor or Electron)
- **Mobile app** — React Native or Capacitor wrapping the web app
- **User auth + sharing** — Supabase for accounts so watches/saved spots sync across devices/family
