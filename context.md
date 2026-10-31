# Hermes — Complete Project Context

> **Purpose of this file:** this is the current-state technical briefing for Hermes. It is written so that an AI or engineer with no prior conversation history can understand what the app is, how it is assembled, which code is active, how Spotify playback and queueing work, what constraints are intentional, and how to verify a change.
>
> **Last updated:** 2026-10-28
>
> **Truth hierarchy:** code and tests are authoritative. This file explains them. `README.md` is the user-facing overview. `diary.md` is the chronological implementation log.

---

## 1. Product Summary

Hermes is a **Spotify-first, premium-only web music player** with a dark, liminal, liquid-glass visual language.

Core product traits:

- Search, library, playlists, liked songs and playback use **real Spotify data**.
- Nothing in the primary visible UI uses the legacy demo catalog.
- In-app audio playback uses the **Spotify Web Playback SDK** and requires the user's own Spotify **Premium** account.
- Home is the emotional center:
  - current track card when something is playing;
  - a floating “Let's dive in” cover card when idle;
  - floating taskbar sections over Home instead of navigating away.
- Synced-first lyrics use LRCLIB, with lyrics.ovh as an unsynced fallback.
- The UI is intentionally minimal: no search suggestions, no recent-search chips, no fake recommendation shelves, no Spotify branding clutter.
- Motion is deliberate and GPU-conscious. Large moving layers use transform/opacity only. There is an automatic lite rendering tier for constrained browsers/devices.
- Spotify's DRM-protected playback audio cannot be sampled by Web Audio; the transport wave and the Audio Pulse row mark therefore follow the player's effective output volume/mute rather than raw decoded samples.
- **Last.fm-compatible scrobble eligibility** is evaluated locally per track and recorded in a browser-local ledger; no Last.fm API, account or credentials are used.

Current app status:

- Local production build runs at `http://127.0.0.1:3000`.
- Not deployed.
- No Capacitor/native shell has been created. A web + mobile deployment direction was discussed, but no implementation was approved beyond planning.
- Canonical local origin is `127.0.0.1`; `localhost` is redirected before hydration so cookies and OAuth share one origin.

---

## 2. Technology Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15.5.28 App Router |
| UI | React 19.1.1, TypeScript 5.7 |
| Styling | Tailwind CSS 3.4 + handwritten CSS in `src/app/globals.css` |
| Global state | Zustand 5 with persisted stores |
| Validation | Zod 3.25 |
| Icons | lucide-react |
| Unit tests | Vitest 3.2 |
| E2E | Playwright 1.64 (`channel: "chrome"` by default; Brave is tested with its executable path) |
| Lint | Oxlint |
| Server | Next.js route handlers (`nodejs` runtime), server-only Spotify modules |
| Audio | Spotify Web Playback SDK / Web API |
| Lyrics | LRCLIB + lyrics.ovh fallback |
| Fonts | Self-hosted Inter, Inter Tight, Instrument Serif WOFF2 |

No UI component library is installed. The liquid-glass primitives are local components in `src/components/ui`.

---

## 3. Environment and Setup

### 3.1 Required environment variables

Defined in `.env.local` (never committed; `.env.example` is the template):

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_MARKET=US          # optional ISO code
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
AUTH_SECRET=...            # reserved; currently unused by the active Spotify flow
```

Security rules:

- Never expose `SPOTIFY_CLIENT_SECRET` or `AUTH_SECRET` to the browser.
- Never add a `NEXT_PUBLIC_` prefix to server credentials.
- Do not print the contents of `.env.local` in logs, docs, commits or tool output.
- Server-only modules import `server-only` so accidental client imports fail early.

### 3.2 Spotify Dashboard

The exact value of `SPOTIFY_REDIRECT_URI` must be registered in the Spotify Developer Dashboard:

- Default local: `http://127.0.0.1:3000/api/auth/spotify/callback`
- Spotify rejects `http://localhost` as an insecure redirect URI. Use `127.0.0.1` or HTTPS.
- The port is part of the exact match.
- If Hermes runs on another loopback port temporarily, the login route canonicalizes to the configured callback and can return to the original loopback port on the same hostname.

### 3.3 Commands

```bash
npm install
npm run dev          # dev server (normally 3000)
npm run build        # production build
npm run start        # production server
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint src
npm test             # Vitest
npm run test:e2e     # Playwright, default dev server on port 3100
```

Operational gotchas:

- Do **not** run `next build` while the production `next start` server is using `.next`; stop the server first, build, then restart.
- Do not run a dev server on the same `.next` cache while production is running.
- After rebuilding, use a fresh tab or hard refresh. Old Playwright/browser tabs can keep stale JS.
- The canonical local URL is `127.0.0.1`; opening `localhost` redirects client-side before React loads.

---

## 4. High-Level Architecture

```
Browser
  ├─ React App Router
  │   ├─ AppShell
  │   │   ├─ AmbientBackdrop + HomeCoverBackdrop (fixed atmosphere)
  │   │   ├─ TopBar (centered liquid taskbar)
  │   │   ├─ page content from src/app/*
  │   │   ├─ PlayerLayer (dock / full / floating Spotify player)
  │   │   ├─ SearchCommand + ImportDialog
  │   │   └─ AppRuntime (hydration, keyboard, motion/quality policy)
  │   ├─ SpotifyPlaybackProvider (SDK + playback/queue state)
  │   ├─ Zustand stores (settings, imports, UI, toasts, legacy stores)
  │   └─ Hooks (Spotify search/covers/history, lyrics, media queries)
  │
  └─ Next.js route handlers
      ├─ OAuth login/callback/logout
      ├─ User session/token
      ├─ Spotify catalog/search/discover/album/artist
      ├─ User library import & queue artists
      └─ LRCLIB/lyrics.ovh proxy

Spotify
  ├─ Web API (catalog with user OAuth when connected, Client Credentials fallback; user endpoints with OAuth token)
  └─ Web Playback SDK (EME/Widevine-protected playback iframe)
```

### 4.1 Provider composition

`AppShell` wraps the app with `SpotifyPlaybackProvider`. The provider exposes four contexts:

- `StateContext` — full playback/queue/session state (`useSpotifyPlayback`).
- `ActionsContext` — stable actions (`useSpotifyPlaybackActions`).
- `PlaybackActiveContext` — a lightweight boolean (`useSpotifyPlaybackActive`).
- `NowPlayingMetaContext` — only `{ trackId, isPlaying }` (`useSpotifyNowPlayingMeta`), so track lists can highlight the current row without subscribing to position ticks.

Use `useSpotifyPlaybackActions()` when a component only needs actions (`requestPlay`, `queueTrack`, etc.) so it does not re-render on every position update. Use `useSpotifyNowPlayingMeta()` for current-row pulse indicators in lists. Use the full hook only where state is genuinely needed.

The shell also mounts `AppRuntime` (store rehydration, quality tier), `StatsSyncRuntime` (account stats sync) and `LyricsWarmup` (background lyrics prefetch for the current track).

### 4.2 Page/overlay layering

| Layer | Z-index | Notes |
| --- | --- | --- |
| Ambient + Home cover backdrops | `-10` | fixed, non-interactive |
| Progressive bottom blur | `30` | fixed decoration |
| Home idle surface | `40` | `HomeIdle` fixed full-screen shell |
| Spotify dock bar | `40` | hidden on `/` (HomeListening owns the large player); shown on every other route |
| HomeStage veil | `44` | dims Home behind floating taskbar cards |
| HomeStage cards | `45` | above Home; taskbar remains above cards |
| Top taskbar | `50` | always available, including above HomeStage |
| Floating Spotify player | `60` | draggable desktop / bottom sheet mobile; stays in-page in the browser; the Electron shell pops it out as an always-on-top window |
| Full-screen Spotify player | `70` | overlays everything except dialogs |
| Search/Import dialogs | `95` | portal overlays |
| Skip link | `120` | accessibility |
| Player prompts | `LiquidDialog` (≈90) | connect / premium / configuration |

`TopBar` intentionally sits above `HomeStage`, so taskbar actions remain clickable while a section card is open.

---

## 5. Route Map

### 5.1 Active pages

| Route | Implementation | Purpose |
| --- | --- | --- |
| `/` | `src/app/page.tsx` → `HomeListening` + `HomeStage` | Main music surface; idle covers or active-track view; floating section cards |
| `/search` | `src/app/search/page.tsx` | Real Spotify search results |
| `/library` | `src/app/library/page.tsx` | Fixed-height two-pane Library: collection scroll + Now Playing/Recent/Queue; connect-first when disconnected |
| `/stats` | `src/app/stats/page.tsx` | Account listening stats synced across browsers: total time, plays, artists, top 5 artists/albums/tracks |
| `/settings` | `src/app/settings/page.tsx` | Real account/player state, motion/lyrics settings, data reset |

Global overlays:

- `SearchCommand`: `Cmd/Ctrl+K` command palette; also taskbar Search.
- `ImportDialog`: taskbar Import.
- `PlayerLayer`: dock/full/floating player.
- `AppRuntime`: persisted-state rehydration, motion/quality, keyboard shortcuts.

### 5.2 Legacy route redirects

`next.config.ts` redirects the old local-demo pages:

| Source | Destination |
| --- | --- |
| `/discover` | `/search` |
| `/albums` | `/search` |
| `/artists` | `/search` |
| `/liked` | `/library` |
| `/recent` | `/library` |
| `/album/:id` | `/search` |
| `/artist/:id` | `/search` |
| `/playlist/:id` | `/library` |

The old page files and legacy components still exist, but they are not part of the active Spotify experience.

### 5.3 API routes

All routes use the Node.js runtime and `no-store` unless noted.

| Method / path | Purpose | Auth |
| --- | --- | --- |
| `GET /api/auth/spotify/login` | Build authorize URL, set per-attempt OAuth state cookie, canonical loopback hop | Server env |
| `GET /api/auth/spotify/callback` | Validate state, exchange code, fetch profile, set session cookies, redirect | Server env + cookies |
| `POST /api/auth/spotify/logout` | Clear auth cookies; same-origin check | Cookies |
| `GET /api/spotify/session` | Return `{configured, connected, profile}` without tokens | Cookies |
| `GET /api/spotify/token` | Return a short-lived user access token to the Web Playback SDK; refresh server-side | Cookies + env |
| `GET /api/spotify/status` | Provider configured boolean | Server env |
| `GET /api/spotify/search?q=…` | Spotify search tracks/albums/artists (6 each) | User OAuth, Client Credentials fallback |
| `GET /api/spotify/discover` | Curated real albums from international artists | User OAuth, Client Credentials fallback |
| `GET /api/spotify/album?album=…` / `?track=…` | Complete album + ordered track list | User OAuth, Client Credentials fallback |
| `GET /api/spotify/artist?id=…` | Ordered artist top tracks for explicit queue playback | User OAuth, Client Credentials fallback |
| `GET /api/spotify/artist-detail?id=…` or `?name=…` | Artist profile (image, followers, genres, popularity) + paginated albums/singles + top tracks; names resolve through Spotify search. Cached 10 minutes server-side | User OAuth, Client Credentials fallback |
| `GET /api/spotify/import` | Import all Spotify playlists + liked songs with pagination | User OAuth |
| `GET /api/spotify/listening` | Artists from the user's current Spotify queue for the Library Artists row | User OAuth |
| `GET /api/spotify/artists?name=…` | Real Spotify artist images for up to five names; resolved URLs cached server-side, exact normalized-name match preferred. Transient lookup failures are omitted instead of cached as `null`; the client retries and persists successful URLs | User OAuth or Client Credentials |
| `GET/PUT /api/spotify/stats` | Per-account listening stats; PUT replaces one browser slice and returns the merged account ledger | User OAuth cookies |
| `GET /api/lyrics?title=…&artist=…&album=…&duration=…` | Synced-first LRCLIB lookup + lyrics.ovh fallback | Public |

---

## 6. Spotify Authentication and Session

### 6.1 Scopes

`src/lib/spotify/oauth.ts` requests:

```text
streaming
user-read-email
user-read-private
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
playlist-read-private
playlist-read-collaborative
playlist-modify-private
playlist-modify-public
user-library-read
```

### 6.2 Cookies

`src/lib/spotify/cookies.ts`:

| Cookie | Contents | Max age |
| --- | --- | --- |
| `hermes_spotify_access` | user access token | token lifetime |
| `hermes_spotify_refresh` | refresh token | 30 days |
| `hermes_spotify_expires` | access-token expiry timestamp | 30 days |
| `hermes_spotify_profile` | base64url JSON profile | 30 days |
| `hermes_spotify_oauth_<state>` | pending OAuth state payload | 30 minutes |

OAuth state payload:

```ts
{ state, redirectUri, returnTo, returnOrigin? }
```

Security properties:

- All cookies are `HttpOnly`, `SameSite=Lax`, `path=/`, and `Secure` on HTTPS.
- One state cookie per attempt prevents a retry/second tab from invalidating an earlier login.
- State TTL is 30 minutes.
- Refresh/profile failures retry once on network errors, 429 and 5xx. Rejected authorization codes / other 4xx are not retried.
- Return paths are allowlisted to `/`, `/search`, `/settings`.
- Cross-host return is rejected; cross-port return is allowed only between the same loopback hostname.
- The client never receives the refresh token. `/api/spotify/session` returns profile/session state only.

### 6.3 Loopback canonicalization

`src/app/layout.tsx` contains a tiny pre-hydration inline script:

```js
if (hostname is localhost or [::1]) {
  replace hostname with 127.0.0.1, preserving path/query/hash
}
```

This exists because:
- Spotify requires a `127.0.0.1` (or HTTPS) redirect URI.
- Cookies are host-scoped; `localhost` and `127.0.0.1` are different cookie jars.
- Using both hosts caused the app to appear disconnected depending on which URL/browser/tab was used.

There is **no `src/middleware.ts`**. Next.js middleware normalized cross-loopback redirects into relative paths and caused a redirect loop; the inline head script replaced that approach.

### 6.4 Login/callback flow

1. Browser hits `/api/auth/spotify/login?returnTo=…`.
2. If the configured callback origin differs from the current origin, login redirects to the configured loopback origin with `returnOrigin` preserved when safe.
3. State cookie is set for the callback host.
4. Browser goes to `accounts.spotify.com/authorize`.
5. Callback validates the state cookie using the `state` query parameter.
6. Server exchanges the code, fetches `/me`, sets auth cookies and clears the OAuth state cookie.
7. Redirect returns to `returnTo` with a status query (`spotify=connected|free|denied|auth_failed|state_error|missing_code|not_configured`).
8. `SpotifyPlaybackProvider` shows a toast and removes the status query.

### 6.5 Session bootstrap

`SpotifyPlaybackProvider` calls `/api/spotify/session` on mount. While loading:

- connected UI is not assumed;
- Home shows a compact skeleton;
- Library shows a skeleton.

Session fallback on network failure is `{ configured:false, connected:false, profile:null }` (honest not-configured state).

---

## 7. Spotify Web API Integration

### 7.1 Request-scoped Spotify API and search

`src/lib/spotify/user-api.ts` exposes `getRequestSpotifyApi(request)`:

- Reads the connected user's httpOnly access cookie and refreshes it server-side when it is within 30 seconds of expiry.
- Creates a `SpotifyApi` instance using that user access token; this is the primary path for search, album, artist and discover requests.
- Falls back to the shared Client Credentials singleton only when there is no usable user session.
- `attachRefreshedTokens` writes newly refreshed access/refresh/expiry cookies onto the API response, so the next request does not refresh again.
- This prevents the app-wide Client Credentials quota from blocking search for a connected user. The Client Credentials bucket is used only for unauthenticated catalog access.

`src/lib/spotify/server.ts` owns the server-only `SpotifyApi` class.

- Client Credentials with Basic auth is used only when no user access token is supplied.
- When an access token is supplied, it is used directly and no token exchange occurs; a rejected token surfaces as `unauthorized` rather than being silently replaced.
- Search cache is module-level across API instances: 60 seconds, max 50 entries, keyed by token mode, query, limit and market.
- Search result limit: 6 per category (tracks, albums, artists).
- Optional `SPOTIFY_MARKET` is normalised uppercase and applied to search/album/top-track requests.
- Errors are mapped to `SpotifyApiError` codes: `not_configured`, `invalid_query`, `unauthorized`, `forbidden`, `rate_limited`, `unavailable`, `invalid_response`, `network`.
- Search route returns safe public metadata only (no provider tokens).
- Search route cache header: `private, max-age=30`; errors are `no-store`.
- Rate-limit responses surface `Retry-After`; search logs distinguish `(user token)` from `(client token)` failures without logging tokens.

### 7.2 Search client

`src/hooks/useSpotifySearch.ts`:

- Minimum query: 2 characters.
- Debounce: 320 ms.
- AbortController cancels in-flight requests when query changes.
- Statuses: idle/loading/success/error.
- Results are not persisted and there are no suggestion/recent-query surfaces.

### 7.3 Discover

`src/app/api/spotify/discover/route.ts`:

- Curated real artists: The Weeknd, Eminem, Travis Scott, OneRepublic, Coldplay, Daft Punk, SZA, Billie Eilish.
- `src/lib/spotify/discover.ts` searches each artist, requires an exact normalized artist match, then reads that artist's albums (`/artists/{id}/albums?include_groups=album`) and selects a verified album with artwork. If the artist-album lookup fails, it falls back to an album from the search response only when the album credits that artist. Artist images are never used as cover substitutes.
- One artist failing does not discard the others; the response includes `complete` and the safe diagnostics log lists missing artist names and provider error codes (never tokens or user data).
- Uses the request-scoped user token first when connected, then Client Credentials; a complete valid result is shared for everyone through the server cache.
- Server cache on `globalThis` (`__hermesDiscoverCacheV2`): complete result 1 hour, partial result 5 minutes, empty/failed result a 60-second retry cooldown. Empty responses are `no-store`; valid results are publicly cacheable.
- Always merged with local listening history by `useSpotifyCovers`; curated covers are never suppressed by a large history.

### 7.4 Album and artist catalog

`GET /api/spotify/album?album=…` returns `{ album, tracks }` with complete album track pagination (50/page). Used by the idle Home cover album dialog and explicit album playback.

`GET /api/spotify/artist?id=…` returns ordered artist top tracks (`/artists/{id}/top-tracks`, market = `SPOTIFY_MARKET` or `US`). Used for explicit artist playback.

Both prefer the request-scoped user token when connected (Client Credentials fallback), use private 10-minute caching, and validate Spotify IDs.

### 7.5 Import

`GET /api/spotify/import`:

- Requires a connected user with playlist/liked scopes.
- All pages of the user's playlists (`/me/playlists`, 50 per page, following `next`).
- All liked songs (`/me/tracks`, 50 per page, following `next`).
- Each playlist's tracks follow the provider's `next` URLs (`/playlists/{id}/items`, 100/page). On the first page only, a 400/404 falls back to `/playlists/{id}/tracks`.
- Up to 4 playlists fetched concurrently.
- 15-second per-request timeout, 3 attempts on network/429/5xx.
- Seen-page guards prevent infinite pagination loops.
- Partial failures preserve collected data: playlists survive a liked-song failure, and a playlist keeps its collected tracks if a later track page fails. A 401/403 on the top-level collections returns an actionable scope/connect error.
- `maxDuration = 60`.
- Returns `{ source:"spotify", playlists, likedSongs }`; client merges into `hermes.library.imported.v1` through `src/lib/import/sync.ts`.
- The sync module dedupes in-flight requests and records loading/success/error state in `useUiStore`.
- `AppRuntime` automatically starts one sync after session readiness and library rehydration when a connected account has no imported data. It never overwrites existing imports with an empty response.
- Scope/auth failures return actionable flags (`needsScope`/`needsConnect`); the Library surface links to Reconnect, while generic failures offer Retry.
- Apple Music import has been removed from the active UI; `ImportSource` still includes `"apple"` as a legacy type.

### 7.6 Listening artists

`GET /api/spotify/listening`:

- Requires user access.
- Reads `/me/player/queue` (currently playing + queue), or `/me/player` fallback.
- Collects unique artist IDs, max 8 top-level artists.
- Fetches `/artists?ids=…`.
- Retained as a queue/history artist row component; the redesigned Library derives its Artists filter from imported track credits and does not mount this row.

---

## 8. Playback Architecture

### 8.1 Playback views

`src/components/player/PlayerLayer.tsx` chooses:

- `view === "full"` → `SpotifyNowPlaying`
- `view === "floating"` → `SpotifyFloatingPlayer`
- else if pathname is `/` → nothing (HomeListening owns the large player; the dock never renders on Home)
- else → `SpotifyPlayerBar`

`dockPlayer()` switches to the dock view. On Home that intentionally shows nothing because the Home player already owns the transport; the bar appears as soon as the route leaves `/`. There is no explicit-dock exception.

`openFullPlayer()` remembers the previous view; Escape calls `closeFullPlayer()`, which returns to the floating window if that is where the full player was opened from, otherwise to the dock. The explicit Dock player button still docks. The floating player is mounted by `PlayerLayer` for every route whenever `view === "floating"`; navigating tabs or opening Home cards does not alter the view.

Views:

| View | Component | Behavior |
| --- | --- | --- |
| Dock | `SpotifyPlayerBar` | bottom glass bar on non-Home routes only; artwork, metadata, seek, prev/Siri wave/next, float/full/close |
| Full | `SpotifyNowPlaying` | immersive full-screen player; artwork/title/transport; lyrics/queue side panel; browser fullscreen API |
| Floating | `SpotifyFloatingPlayer` | draggable glass card on desktop; bottom sheet on mobile; the default result of Float/Minimize; stays mounted across every route and Home card until docked/closed; optional always-on-top pop-out button; dock/expand controls; mute and hover-reveal volume slider |
| Home | `HomeListening` | large artwork and Home-specific transport; never renders the dock bar |

Full-player side panels:

- opens with Lyrics when lyrics are pending or available;
- opening Queue from Lyrics is a temporary replacement; closing Queue restores Lyrics;
- opening Queue from the cover-only layout closes back to cover-only;
- selecting Lyrics while Queue is open switches to Lyrics and closes Queue;
- when lyrics are unavailable, the Lyrics toggle is removed and Queue remains available.

`SpotifyQuickQueue` is a separate compact queue drawer on the Home listening view, shown while a track is active and no HomeStage card is open:

- a glass Q handle sits at the right edge and stays in place while a 322px palette-tinted card slides in from the right on a 420ms spring transition;
- the card shows the same two-layer queue as Spotify: "Next in queue" (manual additions) above "Next from: <context>"; the first upcoming row is marked NEXT;
- every row is a play button wired to the provider's `playFromQueue(index)`; remaining manual entries stay in the manual layer and the context label is preserved; a play glyph appears on hover/focus, replacing the NEXT label on the first row;
- its inline search uses `/api/spotify/search` and adds through the serialized `queueTrack` action, so added songs refresh from Spotify’s real queue;
- it closes when the Q is pressed again, Escape is pressed, or any pointer target outside the card (other than the Q handle) is pressed; focus returns to the Q on keyboard/toggle close;
- reduced-motion settings collapse the slide via the global motion rules. The full player keeps its existing header Queue toggle and side panel instead of the compact drawer.

The full-player background is led by the blurred sleeve, with the palette field adding colour motion. `blurredArtworkUrl` (`src/lib/spotify/artwork-backdrop.ts`) samples the cover into a 256 px canvas, bakes an 18 px blur with 1.65 saturation and 1.02 brightness, and returns a cached data URL (48-entry cap). Two oversized layers (`np-art--a/b`, inset -20%) crossfade over 1.2 s when the track changes and drift with 9 s / 12 s alternate loops at 0.9 active opacity; a second, differently cropped `::after` copy at 42% opacity adds overlapping photographic motion at 6 s / 8 s. `useArtworkPalette` supplies the dominant, secondary, dark and 3×3 spatial palette. Four independent `.np-orb` layers (25 s / 33 s / 43 s / 57 s, negative delays, seamless 0% = 100% keyframes, 0.26–0.32 opacity) plus a `.np-wash` (59 s, 0.42) tint the field, and a 26 s whole-field drift moves all colour regions together. Only transform and opacity animate, so the field never shows a loop reset. Palette custom properties crossfade over 1.4 s and the timelines keep running, so track changes morph instead of restarting. `useAmbientMotion` ramps the existing CSS animations' `playbackRate` to 1 while playing and to 0.08 while paused. The neutral veil is `rgba(8,9,11,0.44)` with 0.012 noise and an edge vignette. Full quality shows four orbs plus the wash; lite shows two orbs, hides the wash, keeps the sleeve copy, and slows the sleeve to 14 s; reduced motion disables all field motion. Missing artwork clears the sleeve layers and keeps the fallback palette visible.

`useSpotifyPlayback` state includes:

```ts
session, sessionStatus, playerStatus, current, active, isPlaying,
positionMs, durationMs, error, view, floatingPosition,
queue, queueIndex, manualQueue, contextName,
shuffle, shuffleAvailable, shuffleBusy, volume, muted
```

Actions include:

```ts
requestPlay, playFromQueue, queueTrack, togglePlay, next, previous,
toggleShuffle, seek, openFullPlayer, minimizePlayer, dockPlayer,
setFloatingPosition, setVolume, toggleMute, closePlayer, disconnect,
refreshSession
```

### 8.2 SDK lifecycle

`SpotifyPlaybackProvider`:

1. Refreshes `/api/spotify/session` on mount.
2. If connected + Premium, prewarms the Web Playback SDK after a zero-delay timer and fetches a token silently.
3. Lazily loads `https://sdk.scdn.co/spotify-player.js`.
4. Creates a player named **“Hermes Web Player”** with:
   - `getOAuthToken` → `/api/spotify/token` (cached/refreshed server-side);
   - current volume/mute.
5. Listens for `ready`, `not_ready`, `player_state_changed`, `authentication_error`, `account_error`, `initialization_error`, `playback_error`.
6. A request made before the player is ready is stored in `pendingRef` and dispatched once ready.
7. Player state polling runs every 1 s while active + playing (plus state events).
8. Playback prompts are `LiquidDialog`s:
   - connect,
   - Premium required,
   - not configured,
   - generic playback error.

Important: the SDK is EME/Widevine-protected and runs in a cross-origin iframe. The page has no access to its audio element or samples.

### 8.3 Starting playback

`requestPlay(request)` → `dispatchPlayback` → `playNow`.

`SpotifyPlayRequest`:

```ts
{
  uris?: string[];
  offset?: number;
  contextUri?: string;      // retained internally; active UI uses explicit queues
  track: SpotifyNowPlaying;
  queue?: SpotifyNowPlaying[];
  queueIndex?: number;
}
```

Current active callers pass explicit URI arrays and queue metadata:

- Search track → one URI, local queue `[track]`.
- Album search result → complete album tracks loaded from `/api/spotify/album`, then explicit queue.
- Artist search result → top tracks loaded from `/api/spotify/artist`, then explicit queue.
- Idle Home cover album dialog → complete album tracks, explicit queue.
- Library playlist / Liked songs → explicit track queue.
- Queue row click → current queue from that offset.

After a successful play response, the provider re-asserts the button's shuffle mode in the background:

```http
PUT /me/player/shuffle?state=…&device_id=…
```

then confirms the device state again (§8.5.1). The play request itself is:

```http
PUT /me/player/play?device_id=…
{ "uris": [...], "offset": { "position": n } }
```

Repeat is not touched; it remains whatever the Spotify device is set to.

Scope checks and UI prompts happen before playback. If not connected → connect prompt; not premium → Premium prompt; not configured → configuration prompt.

### 8.4 Queue model — Spotify's manual queue in front of the context

Spotify keeps two layers: the manual queue ("Next in queue") and the context's own upcoming list ("Next from: <playlist/album>"). Hermes mirrors that split from the SDK:

```text
queue = [current, ...manualQueue, ...contextUpcoming]
contextUpcoming = removeManualOccurrences(next_tracks, manualQueue)
```

Invariants:

1. `next_tracks` remains authoritative, but manual additions are a separate front layer: they are never appended after the context and never reordered by shuffle.
2. Confirmed forward history is merged into `contextUpcoming` one-for-one, so going Previous then Next still returns to the confirmed track once the manual queue is empty.
3. There is no guessed local tail and no local reorder. Hermes never invents queue entries; if the SDK window is short, every accepted manual addition stays visible and the context tail fills in as Spotify reports it.
4. Starting a collection sets the display optimistically to `[current, ...context]` and records `contextName` from the play request (album, playlist, artist top tracks). The first SDK state confirms it.
5. Starting a single search track sets the queue to `[track]`, with no context label.
6. Add to Queue is optimistic and serialized. `queueTrack` appends to the manual layer synchronously, before the network request, then sends Spotify's queue call through `queueAddChainRef`. On failure only that exact entry is rolled back. The SDK is re-read at 150/650 ms (plus the 1 s playing poll) to reconcile.
7. A manual entry is consumed only when it becomes current; only the head is removed, so an identical context copy later in the list stays. The consumed list is passed to `applyDisplayQueue`, which updates the ref and React state together.
8. The queue is displayed in the Home Q drawer, the full-player queue panel, and the Library right-pane Queue tab, all with "Next in queue" and "Next from: <context>" sections driven by the same state.
9. Clicking any upcoming row plays from that position: the remaining flat list becomes the new explicit queue, remaining manual entries stay manual, and the context label is preserved.
10. Shuffle is Spotify's native device shuffle (§8.9). Hermes never rebuilds the queue for shuffle.
11. Spotify's Web API has no queue reorder/remove endpoint. Hermes mirrors the real order.
12. Next and Previous use the confirmed-history navigation plan (§8.5.1). A non-empty manual queue always plays before forward history and before the context.

Queue math lives in `src/lib/spotify/queue-order.ts` (`removeManualOccurrences`, `buildDisplayQueue`, `splitUpcoming`, `resolveQueueIndex`); SDK projection lives in `src/lib/spotify/sdk-queue.ts`; history and navigation plans live in `src/lib/spotify/playback-history.ts` and `src/lib/spotify/playback-navigation.ts`. All are unit-tested.

### 8.5 State reconciliation

`handleState`:

- updates `isPlaying`, position, duration, and current metadata;
- records the confirmed track in the authoritative playback history (§8.5.1);
- removes the SDK's copies of manual entries from `next_tracks`, merges confirmed forward history into the context, keeps the manual layer in front, and resets `queueIndex` to 0;
- falls back to forward-first `resolveQueueIndex` when a state omits `next_tracks`.
- `togglePlay` immediately reconciles by calling `togglePlay()` and then `getCurrentState()`, which prevents a stale Play glyph when the SDK event is missed.
- A successful play reconciles immediately only when the device state matches the just-selected track; a stale snapshot cannot undo the optimistic title/cover.

#### 8.5.1 Playback history and Previous/Next navigation

The authoritative history is `PlaybackHistoryState` (`src/lib/spotify/playback-history.ts`): an ordered `entries` list plus a `cursor`. Entries are keyed by the track URI (with `spotify:track:<id>` fallback) so episodes and duplicate metadata are stable. Spotify publishes the same recording under multiple releases with different track IDs; `isSamePlaybackTrack` treats equal normalized title + artists + duration (within 1.5 s) as the same recording, and a confirmed duplicate replaces the history entry with the ID the device actually reports.

Rules:

- **Record only confirmed transitions.** `handleState` is the only writer. Duplicate events for the current key are ignored. A confirmed forward entry moves the cursor forward. Automatic playback that matches the immediate previous entry steps the cursor back (external Spotify Previous). Any other confirmed track truncates forward history and appends. Manual selections use `origin: "manual"` and never step back, so replaying a song is preserved as a new entry.
- **Manual context changes** truncate unreachable forward history immediately in `beginPlayback`; a failed play still clears the session as before. Switching playlists therefore cannot reuse old forward entries.
- **Previous** (`planPreviousNavigation`): at or after `PREVIOUS_RESTART_THRESHOLD_MS` (2 s, exported) restart the current track with `seek(0)`. Otherwise play the confirmed previous history entry. With no previous entry it does nothing; it never asks Spotify for a random/foreign previous track. Shuffle never changes this.
- **Next** (`planNextNavigation`) precedence: 1) a non-empty manual queue head (Spotify always plays "Next in queue" before history/context), 2) confirmed forward history, 3) the context queue head, 4) `nextTrack()` at the end so Spotify's repeat/stop behavior applies.
- **Native vs explicit.** A native `previousTrack()`/`nextTrack()` is used only when the device's own `previous_tracks` last entry (for back) or `next_tracks` head (for forward) equals the planned target. Otherwise Hermes sends `PUT /me/player/play` with `uris = [target, ...forward history, ...remaining device queue]` and `offset 0`. `buildHistoryFallbackUris` consumes one copy of the target from the device queue and keeps additional copies as intentional repeats.
- **Async safety.** A navigation token invalidates older requests; one waiter is resolved by the matching target state, a mismatch, or a native 1.5 s timeout (3.5 s for an explicit fallback play, which must fetch a new DRM licence). A fallback that returns 204 is reconciled once more against `getCurrentState()` before being treated as failed, and a current track matching the target by recording identity confirms the skip even when Spotify reports a different release ID. Pre-navigation and unrelated states are ignored while a navigation is pending, so the wrong track never reaches the UI or history. Rapid presses are ignored while a navigation is running. A genuinely failed skip clears the pending pointer, reconciles the real device state, keeps history/UI on the last confirmed track, and shows a non-blocking toast rather than the playback-unavailable dialog.
- **Selection settle.** If Next/Previous arrives while a manual play is still confirming, navigation waits up to 1.2 s for that confirmation instead of acting on stale history; if it never confirms, the press is ignored rather than guessing.
- **Automatic completion** is Spotify-driven. Each resulting SDK transition is confirmed through `handleState` exactly once; seeking near the end cannot create duplicate entries. Spotify's Repeat Track/Context applies to the device's URI list, and Hermes has no repeat UI.

Limitations: duplicate URI entries in one context are indistinguishable, so a consecutive replay of the same URI is intentionally treated as a duplicate event; external backward transitions are recognized only when they match the immediate previous confirmed entry; automatic queue ordering remains Spotify's.

**Playlist editing (2026-10-31).** Song rows now expose an Add-to-playlist action backed by `/api/spotify/playlists` (GET editable playlists, POST `action: "add"` or `action: "create"` with an optional `trackId`). OAuth requests `playlist-modify-private` and `playlist-modify-public`; granted scopes live in `hermes_spotify_scope` and the session exposes `canModifyPlaylists`. Spotify only permits changing owned or collaborative playlists, so the list is filtered to those; missing scope shows a reconnect action, 429 preserves Retry-After, and create-then-add partial failure is reported as a created playlist with the track not added. The dialog is mounted once in `AppShell`; song rows in search, the command palette, album dialogs, artist top tracks, and imported collections use it. Spotify redirect icons were removed from song rows, album/artist cards, the command palette, artist detail, and library rows; playback stays in-app. Artist detail now retries the same public lookup with client credentials when the user token fails, caches successful profiles for 30 minutes, and only falls back to imported data when both tokens fail.

### 8.6 Close/disconnect

- `closePlayer()` pauses playback and clears current/queue/view.
- `disconnect()` pauses, disconnects the SDK, clears tokens/state/queue, posts `/api/auth/spotify/logout`, refreshes the session and toasts.
- Disconnected Home/Library become explicitly empty (see §10).

### 8.7 Siri Wave transport

`SiriWave.tsx` is the original 21st.dev “Siri Wave” by 40973894 (MIT), kept as a dependency-free WebGL canvas: a full-screen triangle, the original GLSL `wave` and `fluid-dots` fragment shaders, and Hermes adaptations for playback. Hermes uses the `wave` variant through `SiriPlayButton.tsx` on every player surface:

- full player — hero variant, 200×96 CSS pixels (160×80 on phones), dark glass backing, between Previous and Next under the seek bar; Shuffle lives in the header utility cluster;
- Home — panel variant, 184×64 (160×56 on phones), dark glass backing, in the floating row over the cover bottom;
- dock bar, floating player, Library side panel — compact variant, 108×38 (84×30 on phones), no backing.

Shared behavior:

- **Playback binding:** the shader clock advances only while the provider’s `isPlaying` is true. Pause freezes the line in place; `resetKey={current.id}` resets elapsed time on every track change; closing the player unmounts the canvas. The amplitude input is the same `muted ? 0 : volume` effective output level used by AudioPulse, clamped to 0–1.
- **Visual tuning:** the mint `spectral4` hues are replaced by a muted silver-green tint `[0.78, 0.85, 0.80]`; the additive boost is tinted too. Three shader uniforms shape the small variants: `uAmp` (hero 1.5, panel 1.8, compact 2.15), `uSpread` (1.1 / 1.4 / 1.3) and `uGlow` (1.3 / 1.3 / 1.4). CSS adds a static brightness lift (hero 1.25, panel/compact 1.7). Transparency uses the fragment’s max channel as alpha with `premultipliedAlpha: false`.
- **Morphing control:** the idle control is always the wave — animated while playing, frozen in place while paused. Hover or focus-visible scales the wave away and scales the current Play/Pause glyph in, so the two never sit on top of each other in a steady state; a pointer click settles back to the wave until the pointer leaves. Touch devices with no hover keep a Play glyph visible while paused. `aria-label` and `title` follow the state. OS reduced motion or the Hermes Reduce motion setting holds the shader clock still and reveals the glyph on hover/focus without animation.
- **Idle hero transport:** the hero keeps a fixed **200×96** layout box (160×80 on phones). Its rounded `.siri-play-glass` layer fades out while a separate fixed-size `.siri-play-circle` (96px, 80px on phones) fades/scales in, so the visual morph is identical to the earlier shrinking pill but nothing reflows: the Siri canvas stays at 200×96, the flex gap stays constant, and Previous/Next move inward with **transform-only** translations (66px / 44px) instead of a gap change. The wave/glyph swap stays instant; clicking keeps the circle and returns the wave inside the same canvas. Leaving restores the pill and normal spacing in a synchronized **380ms `cubic-bezier(0.22,1,0.36,1)`** circle/tip transition. This removes the width/height/canvas-resize hover jitter while preserving the design. After 1 s without hover or keyboard `:focus-visible` focus, the glass and side buttons submerge (opacity 0, side buttons `pointer-events: none`) so only the Siri wave floats into the background; any pointer entry or keyboard focus wakes and restores the transport. Pointer-click focus is ignored for the idle timer, so clicking and then moving away still submerges. `SpotifyNowPlaying` owns the 1 s timer plus hover/focus refs and exposes `data-submerged` on the row; `data-settled` controls glyph vs wave visibility. Reduced motion makes these transitions instant; the wave's animation and playback binding are unchanged.
- **Test contract:** the button exposes `data-size` (`hero`/`panel`/`compact`), `data-playing`, `data-level`, `data-track-key` and `data-settled`; the canvas exposes `data-ready`, `data-playing` and `data-variant`.
- **Fallback:** if WebGL or shader compilation fails, the canvas is marked `data-webgl="unavailable"` and renders empty; the button still works as a play/pause control. There is no context-restore listener.
- **Not a real audio visualizer:** Spotify’s SDK uses a cross-origin EME iframe, so Web Audio cannot analyze decoded audio. The wave is procedural GLSL clocked by playback state, not an FFT of the song. Audio Features/Audio Analysis returned 403 for this app's credentials; true sample-level visualization would require explicit tab/system audio capture permission.

`AudioPulse.tsx` remains only as the small current-row indicator in the Library collection dialog, recolored to the same silver-green tint; no player surface uses it.

Home transport includes:
- previous track;
- Siri wave transport (panel);
- next track.

These use the same provider actions as dock/full/floating and sit in a floating glass row at the bottom of the artwork.

### 8.8 Volume

`SpotifyVolumeControl` uses the provider's SDK volume:

- mute/unmute button;
- icon changes by level;
- optional slider;
- optional reveal-on-hover mode in the full-player and floating-player headers;
- on Home, the full player, and the floating player it is visible; the dock bar does not include a volume slider.

### 8.9 Native shuffle

- The Shuffle toggle calls Spotify's device endpoint (`PUT /me/player/shuffle?state=…&device_id=…`). It does not send a play request, rebuild the queue, reset position, or touch history.
- The checked state flips only after Spotify accepts. While in flight, `shuffleBusy` disables the control and extra presses are ignored. A failed request keeps the previous state, shows an error toast, and re-reads the SDK state.
- After success, `getCurrentState()` is read at 120/350/800 ms so the queue panel adopts Spotify's shuffled `next_tracks` quickly. The order stays stable until Spotify changes it; Next follows that order (after a non-empty manual queue), while Previous still follows the actual played history (§8.5.1).
- Turning shuffle off is native: the current song and position continue, and Spotify restores the context order for future tracks.
- Every successful play re-asserts the button's current state in the background; this never blocks playback. Starting a new context therefore keeps the intended shuffle mode.
- `syncPlayerPreferences` reads `GET /me/player` on ready, ~1 s after each play/toggle, and every 5 s while the player is visible. It only mirrors `shuffle_state` into the button (with a 1.5 s guard so an in-flight toggle is never undone); the queue order still comes from the SDK.
- Dialog Shuffle actions start the collection with its original URI order and enable native shuffle after the play; they never pre-randomize a local queue.
- Availability: the toggle is enabled while a current track exists and the started context had at least two entries. A single search-track context shows it disabled.
- Player surfaces: full player and Library side panel, icon-first, off/on/busy, `aria-pressed`/`aria-busy`.
- **Limitation:** the order is Spotify's. Hermes does not maintain a separate local shuffle order; if Spotify's SDK window lags after a toggle, the panel catches up on the 250/1200 ms re-reads. Repeat is whatever the Spotify device has; Hermes has no repeat UI. When Spotify controls a transition (automatic completion with Repeat Track/Context), Hermes records the confirmed result rather than driving it.

### 8.10 Instant start feedback

- `dispatchPlayback` validates the session, then applies `beginPlayback` immediately: the requested cover/title, player bar, queue and playing state appear before the SDK device is ready.
- If the device is still connecting, the request stays in `pendingRef` and runs as soon as `playerStatus` becomes ready; the UI does not wait for that transition. Failed initialization or a failed play request still rolls the optimistic state back and shows the normal error/connect prompt.
- Closing the player clears the pending request, so a request made while connecting cannot start after dismissal.
- The old “Checking account…” and “Starting playback…” toasts were removed; they were visible loading gates on otherwise instant actions.
- Measured with a deliberately delayed fake SDK ready (1.5 s): player feedback 1486 ms → 65–76 ms. Audio still begins when Spotify accepts the play request; the UI no longer hides that work.

### 8.11 In-page floating player (browser)

- Float/Minimize (full player and dock bar) always restores the **in-page glass floating card**. It persists across every Hermes route and Home card.
- The browser has **no Document PiP player**. The old browser PiP window and its pop-out flow were removed; the card's pop-out control is rendered only inside the Electron desktop shell, where it opens the native always-on-top float instead.
- The card uses the original design: 52px cover, title/artist, inline progress, volume, expand/dock, and compact Siri transport. Dragging, route persistence, and the idle/expand behavior are unchanged.
- E2E covers the in-page card appearing on Float, staying across routes, and having no browser pop-out control.

### 8.12 Desktop wrapper (Electron)

A website cannot place its in-page card over other applications. The local Electron shell provides the original left card as a true always-on-top window:

- `desktop/main.cjs` creates the normal Hermes window and, on request, a content-sized (`372` wide, height reported by the card) **frameless, transparent, always-on-top** floating window at the bottom-right of the work area. The window is exactly the card size so no Windows DWM frame, bezel, padding or resize grip is visible; the card itself is opaque, rimless and focused on show. There is **no `-webkit-app-region`**: the whole card (outside buttons/sliders/links) starts a renderer-driven drag, and the main process moves the window from pointer screen coordinates (`floating:drag-start/move/end`), so dragging can never swallow control clicks. `/desktop-floating` reports its content height over `floating:resize`, and the window grows upward while keeping the bottom-right corner anchored. It loads `${APP_URL}/desktop-floating`, reuses an existing server at `127.0.0.1:3000`, or spawns `npm run start` and waits for it.
- `desktop/preload.cjs` exposes only `isDesktop`, `openFloating()`, `closeFloating()` and `focusMain()` through context isolation.
- `/desktop-floating` is a standalone route. `AppShell` bypasses the playback provider, taskbar and ambient layers for it, so it does not create a second Spotify SDK device. Outside the Electron shell it renders a desktop-only message instead of a player.
- `DesktopFloatingPlayer` renders the same left-card design: cover, title/artist, mint progress, Siri wave, Previous/Next, volume, expand, dock and close. The card is an OS drag region; buttons and the volume slider are `no-drag`.
- Playback state flows from `SpotifyPlaybackProvider` over a `BroadcastChannel` (`hermes-desktop-floating`). The provider publishes on every state change plus a 1-second heartbeat. The float refuses cached snapshots (no `localStorage` prefill): on open it requests state, and if no message arrives within 5 seconds it shows “Hermes is not connected” with **Open Hermes** (`focusMain`). Position interpolates every 200 ms only while a message arrived in the last 2 seconds, and snaps back to the live value on track change, pause/seek or drift beyond 1.5 s, so a dead provider can never leave a ghost track ticking. The float sends `toggle`, `next`, `previous`, `mute`, `volume`, `expand`, `dock` commands back. The main window is the only playback device; `backgroundThrottling` is disabled so the bridge keeps working while minimized.
- In Electron, `minimizePlayer()` opens the native float and docks the main player; the in-page card's pop-out control also opens the native float. In a normal browser, only the in-page card is used — there is no Document PiP fallback.
- Scripts: `npm run desktop` (build + launch), `npm run desktop:run` (existing build; starts the server if needed), `npm run desktop:dev` (expects a running dev server).
- `desktop:dev` passes `--no-spawn`; `ensureServer` waits up to 30s for the dev server (the first dev route compile can take seconds) and **never** starts a production server under it. Production startup uses Node directly (no shell/deprecation warning), validates `.next/BUILD_ID` first, and is only used by `desktop`/`desktop:run`; a missing build shows a clear error instead of `next start` failing with "Could not find a production build."
- The shell is a local development wrapper, not a packaged installer/deployment; a distributable build needs packaging and explicit approval. The Electron session is separate from the browser, so Spotify is connected once in the desktop window.
- **DRM:** Spotify audio is Widevine-protected. The **shipped** Windows build uses the castLabs Electron for Content Security runtime, which installs Widevine via the component updater on first launch (`components.whenReady()` runs before the window opens) and exposes `com.widevine.alpha`. The **development** shell (`npm run desktop`, `desktop:dev`) still uses stock Electron, which has no CDM; `initializePlayer` probes EME inside the shell and reports the limitation instead of initialising a silent player. Playback in Chrome/Brave is unaffected.
- **Spotify license edge (verified 2026-10-30):** even with Widevine present, Spotify's `api.spotify.com/v1/widevine-license/...` endpoint returns intermittent `500` responses for the unsigned castLabs package, pausing/skipping tracks (the known castLabs/Spotify issue). **EVS VMP signing fixes it:** after signing the assembled folder, every license request returns `200` and playback is continuous (verified with a real Premium account and a branded exe). Required order: assemble with `HERMES_BRAND_RCEDIT=1` (brand `electron.exe`), then `npm run release:sign` (EVS sign-pkg, copy `electron.exe.sig` → `Hermes.exe.sig`, verify, delete the duplicate host and the local `hermes.env` hold, re-zip). Signing needs Python + `castlabs-evs` and a confirmed EVS account. The zip must never contain `hermes.env`; both build and sign scripts hold it outside the stage while zipping. The provider still auto-retries a requested play (`PLAY_RETRY_DELAYS`) as defense, and presents a Chrome UA. Next with no forward history, no queue and no device next returns a `none` plan (no restart); queued/album Next advances normally.
- `npm run release:win` builds `release/Hermes-0.1.0-win32-x64.zip`: castLabs runtime + `resources/app` (main/preload/assets) + `resources/app/server` (Next standalone + static + public), `Hermes.exe` branded with `desktop/assets/icon.ico` via rcedit, plus `hermes.env.example` and `README.txt`. The packaged server runs as `ELECTRON_RUN_AS_NODE=1 Hermes.exe server.js` on fixed port `47100`, reads `hermes.env` next to the exe (or in userData), stores stats in `%APPDATA%/Hermes/data`, and stops with the app. `app.isPackaged` selects the packaged path; `--url`/`HERMES_DESKTOP_URL` keep the dev path. A single-instance lock focuses the existing window.
- **Per-user credentials:** the release never ships Spotify secrets. Each user creates a Spotify app, registers `http://127.0.0.1:47100/api/auth/spotify/callback`, and fills `hermes.env`. The rcedit branding invalidates castLabs' development VMP signature; if Spotify rejects the license, run castLabs EVS signing on the assembled folder before publishing. The exe is unsigned, so SmartScreen may warn.

---

## 9. Lyrics Pipeline

### 9.1 Server route

`src/app/api/lyrics/route.ts`:

1. Validates title/artist/album/duration.
2. Cache key includes normalized title/artist/album and rounded duration; server memory cache 6 hours; misses cached 30 minutes.
3. Title cleanup strips feature credits, remaster/deluxe/live/acoustic/sped-up/slowed tags and trailing noise.
4. Artist cleanup splits collaborators (`feat`, `ft`, `with`, comma, `&`, `;`, `x`).
5. Exact LRCLIB `/api/get` lookup by duration first; tries album then no album.
6. LRCLIB search variants for primary/collaborator/clean title.
7. Candidate scoring includes title exactness, artist match, album, sync presence and duration delta.
8. **Synced lyrics always outrank plain lyrics**, even if a plain candidate scores higher.
9. If no LRCLIB result, lyrics.ovh is used only as unsynced plain text.
10. Distinguishes “not found” from “service unavailable” so UI can retry.
11. Instrumentals are returned as `instrumental: true` with no lines.

Timeouts: LRCLIB 7s, fallback 3.5s, retries on transient responses.

### 9.2 Client hook and UI

`useTrackLyrics`:

- client cache `v2|title|artist|album|roundedDuration`;
- in-flight requests are deduped per key; `prefetchTrackLyrics` can warm the cache without a mounted panel;
- one client attempt with a 6 s `AbortSignal` ceiling, then one background retry 2.5 s after an error (prefetch failures are not cached, so Retry always refetches);
- the server route has a 4 s total budget, 2 s per LRCLIB call, a circuit breaker that skips remaining LRCLIB calls after the first failure, and a 1.5 s plain-lyrics fallback, so an overloaded upstream returns 502 in roughly 1.5–4 s instead of chaining many 7 s calls;
- parses LRC timestamps (including multiple timestamps per line);
- statuses: idle/loading/success/empty/error.

`LyricsWarmup` runs in the app shell and calls `prefetchTrackLyrics` whenever the provider gets a new current track, so opening the full player renders cached lyrics instead of starting the request on open. Measured: 946 ms with 7 skeletons → about 60 ms with no skeleton.

`SpotifyNowPlaying` computes:

```ts
lyricsPending = idle | loading
lyricsAvailable = success | (empty && instrumental)
showLyricsToggle = pending || available
```

If lyrics are unavailable and not pending, the lyrics button is removed and the lyrics panel is closed. Queue remains available.

`SpotifyLyricsPanel` highlights the active synced line and allows click-to-seek. While playing, the highlight does not step on the provider's roughly 1 Hz position updates: a stable monotonic clock is re-anchored only on a real discontinuity (pause, seek or track change; >220 ms drift), and a rAF loop evaluates the active line continuously between samples (state changes only when the line changes). Lines therefore switch within a frame of their LRC timestamp with a 0.04 s lead instead of up to one second late, without a visible jump when a new sample arrives. Pausing stops the clock. The active line is white and crisp at a 42% scroll anchor; neighbouring lines are dimmed and subtly blurred (0.8px, 1.2px past) with 1.24 line-height and 20px gaps, closely matching Apple Music's out-of-focus lyric stack. The blur radius is deliberately small: 1.8/2.8 px forced per-frame filter rasterization and >100 ms scroll frames. A click seeks immediately so the audio and highlight stay in sync, then glides the panel to the selected line with a custom rAF scroll whose duration grows sublinearly with travel distance (`200ms + 14ms × √distance`, clamped to 360–1300 ms, cubic ease). Automatic line follow uses the same cancellable animation: each new active line retargets from the current scroll offset instead of starting a native smooth scroll, and the resize observer ignores its first callback so layout observation cannot snap the view. Auto-follow is held for 500 ms after a click so the seek can reconcile without fighting the view; wheel/touch input cancels the glide; reduced motion snaps instantly. Plain lyrics are shown as unsynced when that is the only result.

---

## 10. Home Experience

### 10.1 AppShell layers

`src/components/layout/AppShell.tsx`:

- skip link;
- `AmbientBackdrop` — liminal room scene;
- `HomeCoverBackdrop` — cover-derived Home-only washes;
- `TopBar`;
- main content;
- bottom progressive blur;
- `PlayerLayer`;
- `Toaster`;
- `SearchCommand`;
- `ImportDialog`;
- `AppRuntime`.

### 10.2 AmbientBackdrop

`src/components/layout/AmbientBackdrop.tsx` creates the liminal atmosphere:

- doorway/frame/haze/grid/floor;
- grain and vignette;
- ambient orbs;
- cursor light via pointermove + rAF;
- no external assets.

### 10.3 HomeCoverBackdrop

Home-only (`pathname === "/"`), active-track-only:

- reads the artwork palette;
- three translucent palette washes + waterline + veil;
- slow transform-only drift animations;
- animation pauses when `isPlaying` is false;
- hidden entirely when no active track or off Home;
- lite mode converts the washes to static layers;
- the inner component only mounts on Home, so other routes do not subscribe to playback for it.

### 10.4 HomeIdle

`src/components/home/HomeIdle.tsx` has three states:

1. **Session loading** — compact glass skeleton (“Checking your Spotify connection”).
2. **Not connected** — compact `IdleShell` with `SpotifyConnectEmptyState`:
   - “Connect your Spotify account to get started”;
   - explanatory copy;
   - real Connect Spotify OAuth link (`returnTo=/`);
   - Premium note.
   - If configured is false, it says Spotify isn't configured.
3. **Connected** — wide “Let's dive in” card:
   - `useSpotifyCovers` always merges listening-history covers with verified curated Discover albums, so a large history never suppresses the required artists;
   - dedupe uses stable album IDs plus normalized title+artist (`src/lib/spotify/covers.ts`), avoiding duplicate images for the same album;
   - the client keeps a 5-minute cache of valid Discover results and keeps the last good result if a refresh fails; empty responses are not cached as success;
   - skeleton while covers load;
   - clicking a cover opens `CoverAlbumDialog` with the full album track list.

`useSpotifyCovers` is only mounted by the connected Home surface, so Discover is not fetched while disconnected.

### 10.5 CoverMarquee

`src/components/home/CoverMarquee.tsx`:

- duplicates covers to at least 9 per half and then duplicates the half for a seamless loop;
- starts at `scrollWidth / 2`;
- idle drift: `0.034 px/ms`, with sub-pixel accumulation to avoid quantisation stalls;
- hovering/focusing a cover calls `prefetchAlbumTracks`; `CoverAlbumDialog` reads the 5-minute `spotify/album-tracks.ts` cache first (40 entries, in-flight dedupe) so a completed hover or a repeated open renders the track list without a fetching skeleton. Measured with a deliberately slow 500 ms album route: repeat open ~972 ms → about 55 ms;
- pauses while hovered/focused, while dragging, in reduced motion, or in lite mode;
- mouse drag:
  - starts after 3px movement;
  - captures pointer;
  - tracks last 100ms of pointer samples;
  - release throws with velocity clamped to 2.8 px/ms;
  - exponential friction `0.003/ms`, stopping below 0.012 px/ms;
  - wrap in both directions using the duplicated half;
  - velocity expires if the last sample is >90ms old;
  - suppresses accidental card clicks for 120ms.
- touch uses native scroll/inertia; custom throw is mouse-only;
- cards lift/scale/brighten on hover; hover play badge blur is instant.

### 10.6 HomeListening (active track)

`src/components/home/HomeListening.tsx`:

- large artwork (clamped 220–300px) with reflection;
- floating transport row: previous / Siri wave / next;
- track title, artist, album;
- seek slider;
- Spotify volume control;
- the floating Q drawer is the only queue surface on Home; the previous inline queue block below the cover was removed;
- warming the artwork palette in an effect so opening full player does not recolor late;
- if not active/has no current track → `HomeIdle`.

### 10.7 Home taskbar cards (HomeStage)

`src/components/home/HomeStage.tsx`:

- sections:
  - Library — full-size, lazily imported real page;
  - Settings — full-size, lazily imported real page;
  - Connect — compact content-sized card;
  - Profile — compact content-sized card.
- Stage keeps at most one active card plus submerging cards.
- Opening a section marks any previous active card `submerging`, mounts a new active card.
- Submerge animation: 620ms sink/blur/scale/fade; cleanup after 680ms.
- Compact cards: max-width 720px, auto height, top-aligned below taskbar; Library/Stats/Settings remain inset full cards.
- Click veil, close button, Escape, Home button, or re-press active section closes.
- Leaving Home clears `homeSection`.
- Active card receives focus.
- `data-layout="full|compact"`, `data-phase`, `data-section` are used by tests/CSS.
- A dark radial backing prevents Home content ghosting through sparse cards.
- Library/Settings/Stats are loaded through a preloaded-component cache instead of `next/dynamic`: `preloadHomeSection` is called on taskbar hover/focus and at idle, and `LazyStage` renders the real page on the first card render once loaded. `next/dynamic` kept its loading fallback for ~245 ms even after the chunk was already downloaded. `StageLoading` remains only for a first click before the chunk finishes. Measured: Stats content 659 ms/13 skeletons → about 166 ms/0; Settings 499 ms/13 → about 188 ms/0.
- If a lazy section chunk fails (for example an old tab whose chunk URL was removed by a rebuild), `LazyStage` auto-reloads once with a 15 s guard, then falls back to a “Couldn't load … / Reload” panel instead of leaving the skeleton forever. Normal Home playback does not trigger this.

### 10.8 Top taskbar

`src/components/layout/TopBar.tsx`:

- fixed centered glass nav;
- logo + divider + Home / Library / Stats / Search / Import / Connect / Settings / Profile;
- mobile fit: below `390px` the logo and divider are hidden, gaps collapse and padding tightens so all eight controls fit with 40px targets down to 360px; at `≤340px` items become 36px. Verified `scrollWidth === clientWidth` and zero document overflow at 320/360/375/390/414/430, with the Profile control fully on-screen and tappable. The nav still has `overflow-x-auto` as a last-resort escape hatch;
- active navigation state can come from route, HomeStage section, Search dialog, or Import dialog;
- the active glass blob is driven by a spring simulation in `src/lib/nav-liquid.ts`:
  - item geometry is measured with `ResizeObserver`, nav scroll offsets and `getBoundingClientRect`;
  - the blob's center springs between items (`stiffness 420`, `damping 34`), reaching a far target in roughly 230 ms and settling in roughly 520 ms;
  - width stretches by up to 26 px in the direction of travel and height bulges slightly with velocity;
  - a slower ghost rim (`stiffness 180`, `damping 24`) trails the blob and fades to zero at rest;
  - items under the moving blob receive `data-liquid-hot="true"` and transition from muted gray to the active white, so intermediate destinations tint as the blob passes; the final item remains the only hot item at rest;
  - rapid selections retarget the same spring without duplicate highlights; the latest destination always wins;
  - reduced-motion (Hermes setting or OS preference) snaps to the target immediately, removes the trail, and leaves only the destination tinted;
  - no React state updates occur during the animation; transforms and sizes are written directly to the two indicator elements;
- Home behavior:
  - Library/Stats/Settings open floating cards; URL stays `/`;
  - Connect opens Connect card;
  - Profile opens Profile card;
  - Home closes the stage;
  - Search/Import open their global dialogs.
- Off Home:
  - Library/Settings are normal links;
  - Search/Import open dialogs;
  - Connect goes to Settings if connected, otherwise OAuth;
  - Profile opens the compact dropdown.
- When connected but in a Home card, taskbar remains above the stage.
- If configured but disconnected, the Connect control has a CSS breathing halo; it is absent when connected.
- Profile avatar green dot only shows when connected.

### 10.9 Connect/Profile cards

`HomeConnectCard` — real session only:

- configured/not configured;
- connected profile image/name/Premium/Free/Disconnect;
- disconnected Connect Spotify OAuth link.

`HomeProfileCard` — real profile or honest disconnected state:

- Library → Home Library card;
- Settings → Home Settings card;
- Connection → Home Connect card;
- no fake user/avatar identity.

### 10.10 Disconnected empty states

`src/components/spotify/SpotifyConnectEmptyState.tsx` and gates:

- Home connected check in `HomeIdle`;
- Library connected check in `LibraryPage`;
- both show the connect-first message and hide real cached/imported content;
- imported data remains in storage and returns after reconnect;
- backdrop/marquee/Discover/Artists do not fetch or display while disconnected.

---

## 11. Search

### 11.1 Search page (`/search`)

- Aurora-rim `LiquidSearch` field; the page reads an optional `?q=` so the command palette's “View all results” opens the full result set;
- `useSpotifySearch` debounced real API (180 ms);
- a one-character query shows “Type one more character to search.”;
- stale-while-revalidate: the previous results stay visible while a new query debounces/fetches; the skeleton only appears when no results exist yet;
- successful queries are cached for 60 s (40 entries); retyping a query renders instantly without a request; error notices can coexist with the last good results;
- no suggestion chips and no recent-search UI;
- grouped Songs / Albums / Artists;
- track rows: play in Hermes, add to queue when active, add to playlist;
- album cards: play as an **explicit ordered album queue** (loads the album track route first);
- artist cards: play as an **explicit ordered top-tracks queue**;
- loading skeleton only on the first query/error notice/retry;
- explicit-link actions remain available.

Measured: a second query went from 953 ms with a 27-node skeleton to about 443 ms with no skeleton; a cached repeat query is immediate.

### 11.2 Command palette (`SearchCommand`)

- `Cmd/Ctrl+K` or taskbar Search;
- portal overlay;
- same real Spotify search with the same stale-while-revalidate and 60 s cache behavior;
- combobox/listbox semantics with `aria-activedescendant`, `aria-selected` options and a live result count; the active row has a visible focus ring;
- the result list remains capped at 4 tracks + 3 albums + 3 artists for density, with a “View all results for …” action that routes to `/search?q=…`;
- a one-character query shows the same short-query hint;
- no suggestions, no recent queries, no fake local results;
- Space? The palette handles its own matching/escape focus;
- track rows play or queue;
- album/artist rows use the same explicit collection loaders;
- no provider redirect links; every row action stays in the app.

### 11.3 Queue action semantics

Track-level “Add to queue” is available only when playback is active. The row appears immediately in the "Next in queue" layer, then Spotify's queue call is serialized through `queueAddChainRef` and the SDK is refreshed at 150/650 ms so the panel converges on Spotify's real order. Album/artist collections start explicit context queues with a `contextName` label ("Next from: …"), so playback continues with the collection after the manual queue empties.

---

## 12. Library

`src/app/library/page.tsx` is a thin route; the shared UI lives in `src/components/library/LibraryView.tsx` and is also used by the HomeStage Library card via `LibraryCard.tsx`.

### 12.1 Layout and scrolling

- The connected Library is one fixed-height glass workspace (`.library-workspace` in `globals.css`) with two panes:
  - left ≈ 63–64%: title, search, filters, sort and the complete collection;
  - right: Now Playing, then Recently Played / Queue.
- Both panes are grid children of the same workspace, so their top and bottom edges match exactly regardless of collection size.
- The left pane has its own scroll container (`data-testid="library-playlist-scroll"`) containing the collection rows. With 10, 30 or 300 playlists the workspace height stays constant and the document does not grow.
- On desktop the workspace height is `calc(100dvh - 13rem)` at ≥768px and `calc(100dvh - 15rem)` at ≥1024px, matching AppShell padding. Inside the HomeStage Library card it fills the card content area (`height: 100%`).
- Below 768px the panes stack naturally and the page/card scrolls; the right pane is not squeezed into the left.
- The global bottom ProgressiveBlur is suppressed on `/library` and while a HomeStage card is open so it cannot fade the workspace's final row.

### 12.2 Header, filters and search

- `Your Library` heading; collection count; `Imported` label.
- Library search filters collection names and their track names/artists/albums. It is local, deferred (`useDeferredValue`) and never suggests results.
- Filters: All, Playlists, Albums, Artists.
  - All = Liked songs + imported playlists.
  - Playlists = imported playlists.
  - Albums = albums derived from real imported track metadata.
  - Artists = artists derived from real imported track credits.
- Sort: Recently added (importedAt maximum for derived collections) or A–Z. Sorting never reloads or resets the scroll container.
- Item count reflects visible collection results.
- Sync status remains distinct: syncing line, error panel with Retry/Reconnect, and honest empty-library copy.

### 12.3 Collection rows and dialog

- Rows show a stable thumbnail, name, kind/track-count metadata, and a play action revealed on hover/focus (always visible on touch).
- Clicking the row opens the existing floating collection dialog with all tracks, in-list search, Play all, per-track play and add-to-queue when playback is active. Every track row shows a 36 px rounded Spotify album cover from the imported `track.imageUrl`, then the index, title/artist, duration and action; the currently playing row replaces its play glyph with the animated Audio Pulse; other rows keep the static glyph, and the dialog subscribes only to the track/play meta context.
- Playback remains the existing Spotify provider: explicit URIs, no second player.
- The selected collection gets a restrained active surface.
- Empty library, empty filter, empty search and derived-collection empty states are distinct.
- The previous Library Discover and Listening Artists rows are no longer mounted here; curated discovery remains on Home, and the Artists filter derives real artists from imported tracks.
- Artists in the Library Artists filter render real Spotify profile photos. `useArtistImages` fetches them from `/api/spotify/artists` in batches of five (two requests in flight), caches successful URLs for 24h in localStorage, retries transient failures, and falls back to initials only when an artist genuinely has no photo. Stats uses the same hook.
- Clicking an artist row opens `ArtistDetailDialog`, not playback. The liquid-glass panel shows the artist header, Popular top tracks, Albums, Singles and EPs, and a real-data About section (followers, album/single counts, genres, Spotify popularity, Spotify link). Search artist cards and the command palette open the same panel; their main click no longer starts playback.
- If Spotify rejects or times out the artist-detail request (for example a 429 rate limit), the panel falls back to the imported library: album tiles derived from the user's tracks, their songs, and local About facts, with a clear retry notice. It never falls back to an error-only screen when local data exists. The client aborts the request after 6.5s so a slow API cannot leave the skeleton up indefinitely.

### 12.4 Right playback pane

`src/components/library/LibraryPlaybackPanel.tsx`:

- uses the real `SpotifyPlaybackProvider` state and actions;
- compact Now Playing artwork/title/artist/album, real progress slider, previous/play-pause/next, full-player action;
- inactive state says “Nothing playing” and never shows fake playback;
- below it, a tabbed list:
  - **Recent** uses real browser-local listening history; clicking a row plays that track through the provider;
  - **Queue** shows the real SDK upcoming queue split into "Next in queue" and "Next from: <context>"; every row is clickable through `playFromQueue`.
- The pane rerenders with playback, but the left collection does not subscribe to position ticks; a lightweight `useSpotifySession` context gates the Library shell without per-second rerenders.

### 12.5 Data and persistence

- `src/lib/library/collections.ts` derives playlist, liked, album and artist collections from imported provider data only; no names, counts, dates or artwork are invented.
- Playlist artwork priority: custom playlist image → up to four distinct real track images as a mosaic → neutral fallback.
- Collection derivations and search text are memoized; artwork shapes reserve dimensions and lazy-load.
- Legacy library data (`hermes.library.v1`) is not used by this page. The active store is `hermes.library.imported.v1`.
- Collection dialog closes when the account disconnects.
- All imported songs are played as explicit Spotify URIs; entries without a playable URI are shown without a playback action.

### 12.6 Listening stats

`src/app/stats/page.tsx` and `src/components/stats/ListeningStatsPanel.tsx`:

- accessible as the Stats taskbar item: on Home it opens the floating HomeStage card; elsewhere it is a real `/stats` route;
- reads the local ledger in `hermes.spotify.stats.v1` through `useListeningStats` for immediate and offline display, then syncs it to the account ledger; when connected, the surface prefers the merged account data so every browser shows the same totals;
- the local ledger renders immediately when it has any listening history and the account merge updates it in place; only an empty local ledger waits briefly for the account snapshot, so returning browsers avoid a data skeleton;
- each browser keeps a stable browser id; a PUT replaces only that browser's slice (idempotent, never double-counted), and GET returns the merge; a global StatsSyncRuntime in the app shell keeps this running on every page (not only /stats), pushes are debounced after local changes, polled every 15 s while visible, and pushed with keepalive when the tab is hidden;
- the server route `/api/spotify/stats` authenticates through the httpOnly Spotify cookies, keys by profile id, validates and bounds the ledger, and stores browser slices in `.data/spotify-stats.json` with serialized atomic writes, 180-day retention and at most 10 browsers per user; play counts and time are summed, newest metadata and last-played win, earliest startedAt wins;
- no tokens or secrets are stored in or returned from the stats store; if the session or server is unavailable the UI falls back to the local ledger;
- summary: total actual time listened, tracks played, unique artists heard, and the tracking start date;
- top 5 artists, albums and tracks by actual listened time; artists split collaboration credits and albums group by album name + primary artist; each row shows time and plays with no ratio bars;
- top artists resolve real Spotify images through `/api/spotify/artists` (`useArtistImages`), exact normalized-name matching first, falling back to initials only when Spotify has no image; albums and tracks use real album artwork. A transient lookup failure is never cached as “no image”: the route returns 503 when nothing resolves (or partial results plus `incomplete`), the hook retries at 4 s/12 s and again when the tab becomes visible, successful URLs persist in `localStorage` for 24 h, and a resolved-but-missing artist is the only case that keeps initials;
- decorative icons and explanatory captions are intentionally absent; summary tiles and ranking rows use a small transform-only hover lift with a 300 ms spring;
- empty state starts honestly with "No listening stats yet"; the obsolete device-only header label was removed now that stats are account-scoped;
- on mobile the three leader sections stack with horizontal dividers; desktop uses three columns.

The ledger in `src/lib/spotify/stats.ts`:

- `recordListeningStart` increments plays when the Spotify SDK reports a new current track;
- the playback provider measures position progress against wall time, so paused time and forward/backward seeks are ignored; accumulated time is attributed to the current track, artist credits and album;
- writes are batched every 4 seconds, flushed on pagehide/visibility-hidden and when the player closes or disconnects;
- malformed storage entries are skipped, prototype-like IDs are rejected, and storage failures never break playback;
- "Reset all Hermes data" clears the local ledger along with imports, history, artists and settings; the next sync replaces this browser's server slice with the cleared ledger, while other browsers' listening remains part of the account totals.

### 12.7 Last.fm-compatible scrobbling

Scrobbling is a self-contained engine in this codebase. It does **not** call Last.fm and requires no API key, account, OAuth flow or network submission.

`src/lib/scrobble/engine.ts`:

- a track must be **longer than 30 seconds**; exactly 30 seconds and anything shorter never scrobbles;
- for a longer track the threshold is `min(duration / 2, 240 s)` — 2 min → 60 s, 3 min → 90 s, 5 min → 150 s, 8 min → 240 s, 10 min → 240 s;
- an unknown or invalid duration never invents a value; it uses the safe 240 s maximum threshold and omits `duration` from the record;
- the threshold is computed per track, not from a universal 30 s timer;
- a session stores the play-start Unix timestamp separately from `listenedMs`; the emitted timestamp is when the track started playing, not when the threshold was crossed;
- listening progress comes from the same wall-clock/position delta used for listening stats, so paused time and seeks do not count;
- a session emits at most one eligible record; episodes are excluded;
- `duration` is rounded to whole seconds only when a trustworthy duration exists.

`src/lib/scrobble/ledger.ts`:

- persists eligible records in `hermes.scrobbles.v1` with a generated id, the play-start timestamp and a local `recordedAt`;
- records `artist`, `track`, optional `album`, optional `duration`; duplicate artist/track/timestamp plays are ignored;
- validates and bounds every stored field, skips malformed entries, and treats unavailable/full storage as non-fatal;
- `clearScrobbles()` backs Settings' Clear history and Reset actions;
- the ledger is browser-local; it is not account-synced and is not submitted anywhere.

The playback provider creates a session when the Spotify SDK reports a new unpaused non-episode track and advances it from measured listening progress; the due record is written locally. There is no server route and no client outbox.

---

## 13. Settings

`src/app/settings/page.tsx` is real-state only.

Sections:

- **Appearance** — Reduce motion (system/reduced), Lyrics size (normal/large).
- **Playback** — provider/configuration, live player status (Not connected / Premium required / Connecting / Ready / Playing / Unavailable).
- **Connections** — real Spotify avatar/name/Premium-Free, Reconnect/Connect, Disconnect.
- **Data** — Clear history + artists; Reset all Hermes data. Both actions use the shared flat glass `.btn` grammar (Reset uses `.btn-danger`), not the aurora halo. The reset dialog traps Tab, restores the trigger on close, and one Escape closes only the dialog (not the Home card underneath).
- Connect preserves `/library` and `/stats` as return paths; the taskbar Connect on Settings focuses the Connections panel instead of pushing the same route.

Reset clears:

- imports;
- Spotify listening history;
- listening stats ledger;
- eligible scrobble ledger;
- cached artist history;
- local settings.

It does **not** log the user out; use Disconnect for the account.

No fake demo user, demo engine or simulated stats.

---

## 14. Persistence and State Stores

| Key | Store / owner | Purpose |
| --- | --- | --- |
| `hermes.settings.v1` | `useSettingsStore` (`src/store/settings.ts`) | motionPreference, lyricsScale |
| `hermes.library.imported.v1` | `useHermesLibraryStore` (`src/store/hermes-library.ts`) | Imported playlists, liked songs and import timestamp |
| `hermes.spotify.history.v1` | `src/lib/spotify/history.ts` | 40 recent played Spotify tracks |
| `hermes.spotify.stats.v1` | `src/lib/spotify/stats.ts` | Local per-track plays, actual listened time, artist/album attribution and tracking start date |
| `hermes.scrobbles.v1` | `src/lib/scrobble/ledger.ts` | Browser-local eligible scrobble records with play-start timestamps |
| `hermes.spotify.artists.v1` | `src/lib/spotify/history.ts` / `ListeningArtists` | Up to 12 recent artists |
| `hermes.perf.lite` | `sessionStorage` via `AppRuntime` | Whether the tab opted into/auto-detected lite effects |
| `hermes.library.v1` | legacy `useLibraryStore` | Legacy demo collection; not used by active library UI |
| `hermes.player.v1` | legacy `usePlayerStore` | Legacy local player prefs; only persisted volume/repeat/lyrics fields |

All persisted Zustand stores use `skipHydration` and rehydrate in `AppRuntime`; server and first client render agree. `safeLocalStorage` makes access SSR-safe.

Playback queue/current/position are **not persisted** across page reloads. They live in `SpotifyPlaybackProvider` state; Spotify itself remains the audio owner.

---

## 15. Design System and Motion

### 15.1 Fonts and core tokens

`src/app/globals.css` defines:

- `--font-sans`: Inter;
- `--font-display`: Inter Tight;
- `--font-serif`: Instrument Serif;
- Background `#040506`;
- acid/mint accent system;
- glass line/surface tokens;
- ease-spring/ease-out;
- player height;
- noise data-URI.

Fonts are self-hosted in `public/fonts` and preloaded in `layout.tsx`; font caching is one year.

### 15.2 Glass grammar

- `.liquid` — base translucent glass panel with backdrop blur.
- `.liquid-raised` — denser raised glass.
- `.liquid-inset` — inset panel.
- `.rim::before` — 1px mask-composite rim light.
- `.grain::after` — noise overlay, soft-light.
- `.play-btn` — mint gradient play/pause surface; sizes `--lg`/`--sm`.
- `.audio-pulse` — waveform/pause mark.
- `.skeleton` — shimmer loading placeholder.
- `.range` / `LiquidSlider` — custom seek/volume controls.
- `.library-song-scroll` — thin mint scrollbar.
- `.noise`, `.spotify-dock`, `.np-*`, `.home-*`, `.nav-liquid-*` — atmosphere/taskbar/player effects.

### 15.3 Motion policy

- `AppRuntime` sets `html[data-motion="reduced"|"full"]`.
- Settings “Reduce motion” toggles system/reduced. `system` maps to `full` in the app’s dataset, while OS CSS reduce-motion still shortens CSS animations/transitions.
- Home cover marquee and cover backdrop explicitly read the dataset.
- Large animated layers use transform/opacity only.
- Avoid blur/mix-blend on large animated layers.
- The lyric list keeps its soft-focus look with a subtle `blur(0.8px)` / `blur(1.2px)` radius. The earlier 1.8/2.8 px radii forced the blurred lines to re-rasterize on every scroll frame and produced >100 ms frames. Manual wheel/touch scrolling is tracked in a ref, so it never triggers a React render per event. Do not put `will-change: transform` on the masked lyric scroller: measured frames exceeded 100 ms.
- `AudioPulse`, `SiriWave` and `CoverMarquee` respect reduced motion in JS.

### 15.4 Key motion constants

| Feature | Value |
| --- | --- |
| HomeStage rise/submerge | 620ms, cleanup 680ms |
| Nav liquid pill | 520ms spring-like curve |
| Nav liquid trail | 720ms ease-out |
| Cover auto drift | 0.034 px/ms |
| Cover throw friction | 0.003/ms |
| Cover throw clamp | 2.8 px/ms max, 0.08 start threshold, 0.012 stop |
| AudioPulse attack/release | 90ms / 220ms |
| Home cover wash | 30s / 42s / 36s alternate |
| Full-player cover field | 7 s / 10 s artwork-layer drift; 6 s / 8 s flow copies; 1.2 s crossfade; 18 s in lite |

### 15.5 Performance quality tier

`src/lib/performance-quality.ts` + `AppRuntime`:

- Detect software WebGL renderer strings (SwiftShader/llvmpipe/etc.). The probe is deferred with `requestIdleCallback` (2s timeout; 350ms timeout fallback) after first paint: creating a throwaway WebGL context to read the renderer blocked first content for ~0.8s on software rasterizers. Deferral cut the cold long task from ~822ms to ~70ms; it still switches to lite when a software renderer is found.
- Sample 2-second frame windows at startup and after pointerup/keydown/wheel interactions (8s throttle; up to 5 startup windows).
- First window severe threshold: <35 fps or >40% frames >32ms.
- Later windows: <48 fps or >20% slow frames.
- On trigger: `html[data-quality="lite"]`, persisted in `sessionStorage`.
- Query overrides: `?perf=lite` and `?perf=full`.
- Lite CSS:
  - reduces/removes large backdrop filters;
  - removes redundant large blur filters;
  - stops the Home cover wash and static full-player layers, but keeps one transform-only artwork layer drifting in the full player so the field visibly moves;
  - stops marquee auto-drift;
  - keeps the Siri transport and the Library AudioPulse row mark, layout, artwork and essential controls;
  - simplifies HomeStage card transitions;
  - static overrides for heavy surfaces.
- Normal hardware-accelerated Chrome/Brave stays `full`.

Performance target: **60fps or better**; do not add full-screen animated blur/filter/mix-blend layers.

### 15.6 Artwork and palette

`ArtworkImage`:

- uses native `<picture>`/`<img>`, not `next/image`;
- local demo art uses AVIF/WebP responsive variants;
- remote Spotify images are rendered directly;
- failed image shows a palette-gradient music icon;
- `draggable={false}`.

`src/lib/palette.ts`:

- client canvas palette extraction from a 60px sample: dominant hue families plus a 3×3 spatial grid (dark pixels included in cells, excluded from color families);
- cross-origin Spotify images use `crossOrigin="anonymous"`;
- 3 output colors (`a`, `b`, `c`) tuned in HSL, plus 9 grid colors;
- module-level cache by URL; the provider warms the current and next track covers;
- `paletteStyle` sets `--np-a/b/c` and `--np-g0..g8`.
- HomeCoverBackdrop and full/floating players use these colors.
- The full-player atmosphere is the sleeve's own colour layout, not palette blobs: `blurredArtworkUrl` pre-blurs a 256 px sample (18 px blur, 1.65 saturation, 1.02 brightness) and two oversized layers crossfade between tracks while drifting on 7 s / 10 s transform-only loops; each layer has a 42%-opacity, differently cropped `::after` copy flowing on 6 s / 8 s. A flat neutral 0.54 scrim, 0.012 noise and a top vignette keep it dark. The field keeps moving while paused, and only the Siri wave freezes. Full quality runs both layers and flow copies; lite hides the inactive layer and flow copy and slows the active layer to 18 s. Reduced motion disables the drift.

---

## 16. Component and File Map

### 16.1 `src/app`

| File | Role |
| --- | --- |
| `layout.tsx` | metadata, font preloads, canonical-host inline script, `AppShell` |
| `page.tsx` | Home: `HomeListening` + `HomeStage` |
| `globals.css` | all tokens, glass grammar, atmosphere, motion, lite/reduced rules |
| `error.tsx` / `not-found.tsx` | app error/404 surfaces |
| `search/page.tsx` | active Spotify search page |
| `library/page.tsx` | thin route rendering the shared LibraryView |
| `components/library/LibraryView.tsx` | fixed-height two-pane Library shell, filters/search/sort, rows, sync states |
| `components/library/LibraryPlaybackPanel.tsx` | Now Playing + real Recent/Queue side pane |
| `components/library/LibraryArtwork.tsx` | playlist image / genuine track mosaic / neutral artwork |
| `components/library/LibraryCollectionDialog.tsx` | floating full collection dialog with search/play/shuffle/queue |
| `components/library/LibraryCard.tsx` | HomeStage wrapper for LibraryView |
| `settings/page.tsx` | active settings |
| `album/[id]`, `albums`, `artist/[id]`, `artists`, `discover`, `liked`, `playlist/[id]`, `recent` | legacy catalog pages; redirected by `next.config.ts` |

### 16.2 `src/app/api`

| File | Role |
| --- | --- |
| `auth/spotify/login/route.ts` | OAuth authorize URL + state cookie + canonical hop |
| `auth/spotify/callback/route.ts` | state validation, token exchange, profile, auth cookies |
| `auth/spotify/logout/route.ts` | clear auth cookies |
| `spotify/session/route.ts` | safe connected session |
| `spotify/token/route.ts` | short-lived user access token for SDK |
| `spotify/status/route.ts` | server configured flag |
| `spotify/search/route.ts` | sanitized search |
| `spotify/discover/route.ts` | verified curated albums + tiered cache/failure cooldown |
| `spotify/album/route.ts` | album details + full tracks |
| `spotify/artist/route.ts` | artist top tracks for explicit playback |
| `spotify/import/route.ts` | all playlists/liked songs import |
| `spotify/listening/route.ts` | current queue artists |
| `spotify/artists/route.ts` | cached real artist-image lookup from Spotify search |
| `lyrics/route.ts` | LRCLIB/lyrics.ovh lookup |

### 16.3 `src/components/layout`

| File | Role |
| --- | --- |
| `AppShell.tsx` | global layering/provider composition |
| `TopBar.tsx` | centered taskbar, liquid active indicator, Home card actions |
| `AmbientBackdrop.tsx` | liminal base atmosphere + cursor light |
| `Toaster.tsx` | toast rendering |
| `MercuryPourNav.tsx` | experimental nav primitive; not used by current TopBar (kept/tests) |

### 16.4 `src/components/home`

| File | Role |
| --- | --- |
| `HomeListening.tsx` | active track Home surface; prev/pulse-play/next; seek; volume; floating Q queue |
| `HomeIdle.tsx` | session loading / disconnected / connected idle card |
| `CoverMarquee.tsx` | infinite cover strip in full and lite quality, continuous under hover/focus, touch/drag hold, throw momentum |
| `HomeCoverBackdrop.tsx` | active-track cover palette Home wash |
| `HomeStage.tsx` | floating full/compact Home section cards + submerge |
| `HomeConnectCard.tsx` | real Spotify connection card |
| `HomeProfileCard.tsx` | real profile card and navigation actions |
| `ListeningArtists.tsx` | queue/history artist row component; no longer mounted in the redesigned Library |

### 16.5 `src/components/player`

| File | Role |
| --- | --- |
| `PlayerLayer.tsx` | chooses dock/full/floating/none; dock is always suppressed on Home |
| `SpotifyPlayerBar.tsx` | dock bar |
| `SpotifyNowPlaying.tsx` | full-screen player + lyrics/queue panel toggles |
| `SpotifyQuickQueue.tsx` | Home floating glass Q drawer: authoritative up-next, click-to-play rows, inline search-to-add, outside/Escape/toggle close |
| `SpotifyFloatingPlayer.tsx` | draggable mini player with mute and hover-reveal volume |
| `SpotifyLyricsPanel.tsx` | synced/unsynced lyrics rendering |
| `SpotifyQueuePanel.tsx` | full upcoming queue list |
| `SpotifyVolumeControl.tsx` | SDK volume/mute control |
| `AudioPulse.tsx` | animated current-row mark in the Library collection dialog |
| `SiriWave.tsx` | original 21st.dev WebGL Siri Wave (MIT), playback-clock, tint, transparency, amp/spread/glow adaptations |
| `SiriPlayButton.tsx` | Siri Wave transport on every player surface (hero / panel / compact) with play/pause morph |
| `FloatingPlayer.tsx`, `NowPlaying.tsx`, `PlayerDock.tsx`, `Transport.tsx`, `QueuePanel.tsx`, `LyricsPanel.tsx`, `SeekBar.tsx`, `VolumeControl.tsx`, `LikeButton.tsx` | legacy local-player components; not rendered by active `PlayerLayer` |

### 16.6 Other component groups

| Path | Role |
| --- | --- |
| `components/albums/CoverAlbumDialog.tsx` | playable complete album sheet from idle Home covers with play/shuffle |
| `components/common/SearchCommand.tsx` | global command palette |
| `components/common/MediaCards.tsx`, `SectionRow.tsx`, `Logo.tsx`, `CreatePlaylistControl.tsx` | shared/legacy cards and branding |
| `components/import/ImportDialog.tsx` | Spotify-only import UI |
| `components/stats/ListeningStatsPanel.tsx` | account-synced listening summary + top 5 artists/albums/tracks, real artist images, hover lift, empty/skeleton states |
| `components/search/SpotifyResults.tsx` | Spotify track/album/artist cards, notices, skeletons |
| `components/spotify/SpotifyConnectEmptyState.tsx` | shared disconnected CTA |
| `components/ui/*` | local glass primitives: buttons, dialogs, dropdowns, sliders, toggles, tooltip wrappers (tooltips are not rendered), artwork, progressive blur, AuroraGlowButton, states |
| `components/providers/AppRuntime.tsx` | hydration, automatic library sync, global keyboard, motion/quality, session/media key state |
| `components/providers/SpotifyPlaybackProvider.tsx` | SDK/playback/queue/session source of truth |

Hover tooltips are intentionally not rendered as of 2026-10-29: `LiquidTooltip` is only an inline-flex layout wrapper (its `.tip` class still anchors the transport idle fade), `.tip` has no tooltip pseudo-element, and interactive controls no longer set native `title` attributes. `aria-label` remains the accessible name; do not reintroduce tooltip labels or control `title` attributes.

### 16.7 `src/hooks`

| File | Role |
| --- | --- |
| `useEnvironment.ts` | media query, page title |
| `useScroll.ts` | floating header scroll state |
| `useSpotifySearch.ts` | debounced/abortable Spotify search |
| `useSpotifyHistory.ts` | subscribe to local listening history |
| `useSpotifyCovers.ts` | history + verified curated album merge, stable dedupe, client cache/stale fallback |
| `useListeningStats.ts` | local ledger subscription + debounced account push, 15 s account refresh, local fallback |
| `useArtistImages.ts` | cached real artist-image lookup for Stats leaders |
| `useTrackLyrics.ts` | lyrics fetch/cache/prefetch/parse/retry |
| `useFocusTrap.ts` | modal Tab containment and focus restoration |

### 16.8 `src/lib`

| File | Role |
| --- | --- |
| `spotify/server.ts` | server-only Spotify API client, token/search/album/artist |
| `spotify/oauth.ts` | scopes, authorize URL, state/redirect helpers, token/profile retries |
| `spotify/cookies.ts` | httpOnly cookie/session serialization |
| `spotify/request-origin.ts` | host-aware origin |
| `spotify/user-token.ts` | read/refresh user access from cookies |
| `spotify/playback-types.ts` | shared playback/session types |
| `spotify/types.ts` | sanitized search/API types |
| `spotify/artwork.ts` | Spotify fallback palette/artwork mapping |
| `spotify/history.ts` | local history/artist storage + subscriptions |
| `spotify/stats.ts` | listening ledger, actual-time accumulation, normalization/merge, top-5 aggregation, formatting |
| `spotify/stats-store.ts` | server-only per-account/browser ledger file, serialized atomic updates, merge/prune |
| `spotify/stats-sync.ts` | client browser id + stats PUT/GET transport |
| `spotify/album-tracks.ts` | client album-track cache, in-flight dedupe and cover hover prefetch |
| `scrobble/engine.ts` | Last.fm-compatible eligibility thresholds and per-track listening-session state |
| `scrobble/ledger.ts` | browser-local eligible-play ledger, validation/dedupe, clear |
| `spotify/queue-order.ts` | manual-first display queue, SDK-copy removal, section split, duplicate-safe index fallback |
| `spotify/artwork-backdrop.ts` | cached 128 px pre-blurred sleeve data URLs for the moving full-player field |
| `spotify/sdk-queue.ts` | SDK `next_tracks` mapping in device order |
| `spotify/playback-collections.ts` | client loader for explicit album/artist queues |
| `nav-liquid.ts` | nav spring physics, stretch/energy, tint coverage helpers |
| `lyrics-scroll.ts` | distance-scaled lyric scroll duration and cubic easing |
| `library/collections.ts` | playlist/liked/derived album+artist builders, actual artwork/mosaic, filter/sort helpers |
| `spotify/discover.ts` | curated verified album discovery with per-artist failure isolation |
| `spotify/covers.ts` | stable Home cover merge/dedupe |
| `import/spotify.ts`, `import/errors.ts` | Spotify import client and error types |
| `import/sync.ts` | shared auto/manual library sync, in-flight dedupe, UI sync state |
| `import/types.ts` | Imported track/playlist/payload types; `"apple"` remains a legacy source value while the Apple UI is removed |
| `library/types.ts` | Legacy library snapshot/playlist types |
| `brand.ts` | App name/tagline/accent constants used by Logo |
| `palette.ts` | artwork palette extraction + CSS vars |
| `performance-quality.ts` | lite-tier detection helpers |
| `artwork-variants.ts` | local responsive AVIF/WebP variants |
| `view-transition.ts` | View Transitions helper with reduced-motion fallback |
| `storage.ts` | SSR-safe localStorage |
| `utils.ts` | `cn`, time/count formatting, clamp, shuffle, initials |
| `catalog/*`, `playback/*`, `providers.ts` | legacy local demo catalog/player/provider; tests retained; not active visible audio |

### 16.9 `src/store`

| File | Role |
| --- | --- |
| `settings.ts` | persisted motion/lyrics settings |
| `hermes-library.ts` | persisted imported Spotify playlists/liked songs |
| `ui.ts` | dialogs, Home taskbar section, library sync status/error |
| `toast.ts` | ephemeral toast queue |
| `library.ts` | legacy demo library store; not used by active Library |
| `player.ts` | legacy local-player store; not active UI |

### 16.10 `src/types`

- `spotify-sdk.d.ts` — minimal typings for the Spotify Web Playback SDK.

---

## 17. Tests and Verification

### 17.1 Current inventory

- **212 Vitest unit tests**.
- **92 Playwright E2E tests**.
- TypeScript clean.
- Oxlint clean.
- Production build succeeds.

### 17.2 Unit suites

| File | Coverage |
| --- | --- |
| `aurora-glow-button.test.ts` | Aurora button grammar/CSS |
| `catalog.test.ts` | legacy catalog integrity/search/recommendations/lyrics |
| `covers.test.ts` | curated + history merge, stable album dedupe, malformed skips |
| `discover.test.ts` | verified albums for all curated artists, per-artist failure isolation, no artist-image fabrication |
| `discover-route.test.ts` | complete/partial caching, empty failure cooldown, safe provider diagnostics |
| `hermes-library.test.ts` | active imported store key, dedupe, empty-refresh preservation |
| `library-collections.test.ts` | playlist/liked/album/artist derivation, artwork priority/mosaics, search/sort/counts |
| `import-route.test.ts` | full pagination, empty/partial failures, scopes, refresh cookies, malformed tracks, loop guards |
| `listening-stats.test.ts` | play/time accumulation, delta/seek filtering, top-5 aggregation, formatting, persistence/clear |
| `listening-stats-sync.test.ts` | ledger normalization, per-track cross-browser merge, earliest start/latest update |
| `stats-store.test.ts` | per-account isolation, idempotent browser slices, concurrent writes, persistence, unsafe ids |
| `spotify-stats-route.test.ts` | authenticated PUT/GET merge, no token leakage, unauthenticated fallback, browser-id validation |
| `scrobble-engine.test.ts` | exact >30 s eligibility boundary, half-duration/4-minute cap, unknown-duration fallback, play-start timestamp, one record per session, short-track exclusion |
| `scrobble-ledger.test.ts` | eligible record persistence, duplicate suppression, optional fields, malformed storage, clearing |
| `spotify-artists-route.test.ts` | name validation, exact normalized artist matching, dedupe, partial failures, image cache |
| `library.test.ts` | legacy library store CRUD |
| `nav-liquid.test.ts` | spring settle/overshoot, velocity stretch, tint coverage, mid-flight retarget |
| `lyrics-scroll.test.ts` | distance-scaled duration bounds/monotonicity, cubic ease endpoints/clamping |
| `lyrics-route.test.ts` | LRCLIB synced-first, clean titles, fallback, outage vs miss, cache, instrumental |
| `mercury-pour-nav.test.ts` | experimental nav primitive |
| `performance-quality.test.ts` | frame thresholds + software-renderer detection |
| `playback.test.ts` | legacy simulated playback provider |
| `queue-order.test.ts` | pending additions appended after the SDK queue, dedupe/no-op, duplicate forward/back resolution |
| `sdk-queue.test.ts` | exact SDK order, no local ghosts, duration/metadata merge, episode URL |
| `queue.test.ts` | legacy shuffle/repeat/next/previous |
| `spotify-auth-route.test.ts` | loopback hops, state errors, callback cookies, concurrent attempts |
| `spotify-oauth.test.ts` | scopes, return sanitizers, redirect resolution, token/profile retries |
| `spotify-route.test.ts` | search validation/errors/cache headers/rate limits |
| `spotify-session-route.test.ts` | session privacy |
| `spotify-status.test.ts` | configuration flag |
| `spotify-token-route.test.ts` | token cache/refresh/no refresh-token leakage |
| `spotify-user-api.test.ts` | user-token preference, refreshed-cookie persistence, client fallback, route integration |
| `spotify.test.ts` | server search client, user-token mode, token cache, album mapping, artist top tracks, errors |
| `utils.test.ts` | formatting/clamp/shuffle |

### 17.3 E2E suites

`tests/e2e/player.spec.ts`:

- search palette live Spotify/no fake results;
- automatic connected-library sync without opening Import;
- distinct sync loading/reconnect/empty/retry states;
- library imported playlists/internal scroll;
- Spotify import;
- curated albums remain visible alongside a full listening history;
- Stats card and `/stats` page top-5 data, real artist images, hover lift, hidden caption/bars, playback tracking, and honest empty state;
- Library equal bottom edges + internal playlist scroll with 10/30/300 playlists, search/filter/sort and the live Library side player;
- Home idle covers;
- disconnected Home/Library empty states + breathing Connect halo;
- cover marquee moving under OS reduce/motion setting;
- throw momentum;
- full playable Home cover album;
- the Home cover strip keeps drifting in lite quality and under hover/focus, pauses only for active touch/drag and Hermes reduce motion, and returns to its ambient drift after a throw;
- Library artists;
- centered taskbar, dialog behavior, liquid selector; far-jump stretch and single landing; rapid retargeting; reduced-motion snap without trail;
- crisp cover hover chip with no backdrop-filter inside the drifting strip;
- lite effects;
- localhost canonicalization;
- HomeStage card actions/submerge;
- command palette “View all results” opens `/search?q=` and one-character searches show a hint;
- profile menu Arrow/Home/End/Escape navigation and focus return;
- Connect preserves `/library` and `/stats` return paths;
- Settings appearance toggles, Clear history, and Reset cancel/confirm;
- a console/page-error sweep across every primary route;
- phone layouts for Settings, Search, Stats, the reset dialog and the full player;
- mobile overflow/viewport/cards/marquee.

`tests/e2e/spotify-playback.spec.ts`:

- player prewarm/token;
- quiet prewarm failure;
- in-app play from search;
- no invented queue for a single search result;
- explicit album queue + manual song appended after the SDK queue;
- Library Shuffle action starts the playlist in original order and issues Spotify's native shuffle request, with the first-row pulse intact;
- player shuffle toggle issues native state=true/state=false with no extra play request; Next and Previous stay native and the queue follows the SDK next_tracks;
- shuffle carries into a newly started context;
- a failed native shuffle keeps the confirmed mode, the current song, and sequential Next;
- shuffle is disabled for a single-track context;
- Previous at 0:12 restarts the current song while Previous from 0:00 walks back natively without a new play request;
- account stats render from the merged server ledger even when the local ledger is empty;
- a 31-second track records exactly one scrobble at its 15.5-second threshold with artist/track/album/duration and the play-start timestamp, proving a dynamic per-track threshold instead of a universal 30-second timer;
- the player bar appears within 1 second while the fake SDK deliberately delays ready by 1.5 seconds, then playback starts when the device becomes ready;
- lyrics are prefetched before the full player opens, so the panel shows no skeleton and renders the cached line immediately;
- an album sheet opens from hover prefetch and reopens instantly from cache without a second request;
- a second search query keeps the previous results visible with no skeleton, then shows the new results; retyping a cached query issues no request;
- Home Stats and Settings cards render their real headings without the StageLoading skeleton after taskbar hover preloading;
- pausing the full player keeps the artwork field drifting while the Siri wave freezes;
- the full-player backdrop uses the sleeve's blurred layout per track: the active `np-art` layer's background image changes with the cover, its transform keeps moving, and no `.np-ambient`/`.np-drift` blobs exist; lite still drifts and reduced motion stops it;
- explicit Dock player from a Home full/floating player closes the overlay and leaves the Home card in place; the bottom dock never renders on Home and returns on non-Home routes;
- Reset dialog focus stays on the intended action while playback updates, and Escape closes only the dialog while the Home Settings card remains open;
- the full player opens and exposes its transport on a 390×844 phone without horizontal overflow;
- a manually queued list walks forward with Next and returns correctly with Previous;
- queue another search result;
- queue a library playlist song;
- queue panel reads SDK `next_tracks`; Next plays the track shown as up next after two manual additions;
- floating Q quick queue on Home: 420ms right-to-left drawer motion, authoritative queue rows, playing a queued song from a row, inline search-to-add, collapses from the Q, Escape, and outside clicks;
- Home listening view no longer renders a queue block below the cover; the Q drawer is the only queue surface;
- continuous synced-lyric auto-follow: sampled trajectory stays monotonic across line changes with intermediate scroll offsets and no backward snaps;
- lyric line flips within 300 ms of their true playback time across non-grid-aligned LRC timestamps, proving the highlight runs on the continuous clock rather than the 1 s position poll;
- cover-lit Home + Siri wave transport (wave motion, amplitude, mute flatline, hover glyph, prev/next layout);
- Library collection dialog current-row Audio Pulse replacing the play glyph and animating while that track plays, with a real Spotify cover on every song row;
- full/minimize/dock transitions;
- distance-scaled lyric seek scroll without a jump, with seek-synced highlight and a fully visible target line;
- lyric scroll pacing: three warm fresh-region wheel gestures stay under 60 ms p95 and 90 ms max frame time while the Siri wave animates, and keyboard/click seek highlighting still lands on the correct line;
- lyrics retry and fail-fast budget: the route test asserts only one LRCLIB call after a 503 and returns an error in under 3 s;
- no lyrics → removed toggle;
- connect prompt;
- Premium prompt;
- Connect card.

### 17.4 Running E2E against production

Default `playwright.config.ts` starts a dev server on **3100** and uses `channel: "chrome"`.

For the existing production server on `127.0.0.1:3000`, use a temporary config with:

```ts
use: {
  baseURL: "http://127.0.0.1:3000",
  channel: "chrome",
  headless: true,
  viewport: { width: 1440, height: 1000 },
}
```

To test Brave:

```ts
launchOptions: {
  executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
}
```

Never build while `next start` is running. Stop server → `npm run build` → `npm run start` → run E2E. Delete the temporary config and `test-results/` after verification.

Mocks:

- Spotify Web API and Web Playback SDK are mocked in E2E; no real credentials/login needed.
- Session/discover/search/album/lyrics routes are intercepted.
- Fake SDK exposes `getCurrentState`, transport methods, a `ready` event, a FIFO manual queue plus album context, and `next_tracks`/`previous_tracks` in every state; `seek()` updates the reported position and `nextTrack()` advances the fake queue.
- New UI tests should prefer semantic roles/data-testids and avoid brittle CSS.

---

## 18. Invariants and Constraints

These are product requirements, not incidental implementation details:

1. **Spotify only.** No free playback workaround, shared-owner Premium trick, local demo catalog, or invented recommendation queue in the visible app.
2. **Premium is per user.** In-app playback requires the user's own Premium account. Free users get a clear prompt.
3. **Real data only.** Do not reintroduce demo users, fake stats, fake recently played shelves, fake settings, or fabricated catalogs.
4. **Disconnected means empty.** Home and Library show the connect-first state and hide cached/imported content until Spotify is connected. Data may remain in local storage for reconnect, but not in the visible disconnected UI.
5. **Explicit playback only.** Do not auto-fill queues or invent “next” tracks. Starting a search result plays that track. Adding to queue is explicit.
6. **Queue order matters.** Spotify inserts a new manual item immediately after the current track. Hermes must mirror that visible order and must not append it to the end of the album context.
7. **No artificial list caps** for user data:
   - imports paginate everything;
   - full-playlist dialogs render every song inside an internal scroll;
   - full-player queue renders all upcoming tracks.
   - The Home listening card's queue is a deliberately bounded preview of 8; the full queue panel is complete.
8. **No search suggestions or recent-search chips** anywhere.
9. **No fake album/playlist connectors/graphs.**
10. **No Spotify branding clutter** in the player; provider disclosure remains honest in Settings.
11. **Server secrets stay server-only.** Never add `NEXT_PUBLIC_` to credentials.
12. **Canonical loopback origin is 127.0.0.1.** Do not write cookie/OAuth logic that scopes state to `localhost` differently.
13. **Motion budget:** 60fps target, transform/opacity for large motion, no large-layer blur/mix-blend during animation. Lite mode must continue to work.
14. **Reduced motion:** CSS global rules plus JS policies for marquee, AudioPulse and the Siri Wave (which holds its shader clock and reveals the state glyph on hover/focus). Any new animation needs a reduced-motion path, and reduced motion must win over the lite tier's ambient animations.
15. **Accessibility:** labeled buttons, semantic regions/dialogs, focus-visible rings, Escape/veil dismissal, 44px Home transport targets, `aria-current`/`aria-label` where relevant. Modal dialogs trap Tab and restore focus; the profile menu supports Arrow/Home/End/Escape with focus return; range inputs expose formatted `aria-valuetext`.
16. **Do not deploy or scaffold Capacitor/native** without explicit approval.
17. **Do not mutate imported/local account data on account disconnect.** Hide it; reconnect brings it back.
18. **Do not use `next/image` remote config** for Spotify art; the project uses `<picture>/<img>` through `ArtworkImage`.

---

## 19. Known Limitations / Deliberate Non-Goals

- Spotify DRM blocks raw audio analysis → the transport wave and Library Audio Pulse row mark are volume/mute-driven, not FFT.
- Spotify identity session is cookie-based; clearing browser cookies disconnects.
- Playback queue/current/position do not survive full page reload.
- Spotify Web API offers no queue reorder or remove endpoints.
- Manually queued songs are newest-first (Spotify behavior), not FIFO.
- Home has no inline queue block; the floating Q drawer and the full-player queue panel are complete.
- Artist playback uses top tracks (Spotify top-tracks endpoint) rather than an infinite artist context.
- Library imports are one-way into Hermes local storage. Add to Playlist is the only write-back: it creates playlists and adds tracks to owned or collaborative Spotify playlists.
- Imported library/history are per-browser, not synced across devices.
- No offline downloads; no native mobile shell yet.
- Legacy demo catalog/player and some legacy UI components still exist in the repo; they are not active in the visible Spotify experience.
- `.env.example` documents the required Spotify credentials; real values belong in `.env.local` or `%APPDATA%/Hermes/hermes.env`.
- `AUTH_SECRET` is reserved, not used by the current Spotify auth implementation.
- Local development expects a single canonical loopback origin; stale tabs pointing at an old port/bundle need a hard refresh.
- No light theme.
- Remaining audit polish: some 9–10px secondary metadata uses very low-opacity white, and a few icon-only clear/dismiss controls have a ~20px visual hit area. Home floating cards restore focus on close but do not inert the dimmed page behind them. The cover strip intentionally ignores OS `prefers-reduced-motion` (Hermes Reduce motion is the in-app control); lite ambient CSS now honors reduced motion.
- Real Spotify audio cannot be automated in this environment; playback/queue/transport are verified with the mocked SDK and the user's own Premium login remains the final manual step.

---

## 20. Practical Change Checklist for an AI

Before editing:

1. Read this file plus relevant source/tests.
2. Identify whether the surface is **active Spotify** or **legacy local-demo**. Do not modify legacy behavior unless the task explicitly concerns it.
3. Preserve the invariants in §18.
4. For playback changes:
   - route through `SpotifyPlaybackProvider`;
   - keep explicit queue semantics;
   - update `queue-order.ts` tests if insertion/index logic changes;
   - verify no secret/token leaks.
5. For UI changes:
   - use the existing glass primitives;
   - preserve responsive behavior at 390×844 and 1440×1000;
   - respect reduced motion and the lite tier;
   - keep Home stage/taskbar z-index relationships.
6. For new server routes:
   - use Node runtime, `server-only` modules for credentials, `no-store` for sensitive responses;
   - validate Spotify IDs/input;
   - keep tokens out of responses.
7. Verify:

```bash
npx tsc --noEmit
npm run lint
npm test
# stop next start, then:
npm run build
npm run start
# run Playwright against 127.0.0.1:3000 with a temp prod config
```

8. Clean temporary configs/screenshots/`test-results/`.
9. Update `README.md` and `diary.md` when behavior, counts, or architecture change.
10. If a change affects local auth/origins, verify both Chrome and Brave and open `localhost` once to confirm canonicalization.

---

## 21. External References and Attribution

- Spotify Web API: <https://developer.spotify.com/documentation/web-api>
- Spotify Web Playback SDK: <https://developer.spotify.com/documentation/web-playback-sdk>
- Spotify Add to Queue: <https://developer.spotify.com/documentation/web-api/reference/add-to-queue>
- Spotify Toggle Shuffle: <https://developer.spotify.com/documentation/web-api/reference/toggle-shuffle-for-users-playback>
- LRCLIB: <https://lrclib.net>
- lyrics.ovh: <https://lyrics.ovh>
- Siri Wave by 40973894 on 21st.dev: <https://21st.dev/@40973894/components/siri-wave> (MIT); source adapted in `src/components/player/SiriWave.tsx` with playback-clock, tint, transparency, level and amp/spread/glow uniforms. No 21st.dev account, API key or package was added.
- Efferd UI floating header + progressive blur inspiration: <https://github.com/sshahaider/efferd-ui> (MIT)
- 21st.dev / shadcn floating-dock and spacing conventions informed the taskbar/liquid components; no shadcn package was added.
- Fonts: Inter, Inter Tight, Instrument Serif under SIL Open Font License 1.1.

---

## 22. Current Verification Snapshot

- **Unit:** 212 Vitest tests passing.
- **E2E:** 92 Playwright tests pass in Chrome using mocks for the Spotify SDK/Web API; typecheck, lint and the production build are clean. The Siri transport test covers the full-player morph, play/pause, volume, track changes and reduced motion; a separate transport test covers the hover circle, click circle persistence, inward Previous/Next spacing, the 1 s submerge after a click and wake; a floating-player test proves it stays visible across Library/Stats/Settings/Home and Home cards and returns after Escape-closing the full player; a browser floating test proves the in-page card appears without any pop-out control; the Electron desktop float is verified separately; the Home test covers the panel wave plus dock/panel hover morphs; the Home docking test proves the dock never renders on Home while non-Home routes keep it; the opened-playlist test asserts all 30 song rows render a Spotify cover; the Stats test covers artist-portrait retry after a transient image failure and 24-hour client caching.
- **Release audit (2026-10-28):** every primary route, taskbar control, Home card, dialog, keyboard path and phone layout was exercised. The console sweep is clean; live `/search?q=weeknd` returned six real tracks, six albums and six artists with no console errors. Remaining non-blocking polish is limited to small secondary-text contrast/hit areas, non-inert Home-card backgrounds, and the intentionally continuous cover strip under OS reduce-motion.
- **Instant phases (2026-10-28):** first-play feedback while the SDK connects 1486 ms → 65–76 ms; full-player lyrics 946 ms/7 skeletons → ~60 ms/0; Home Stats 659 ms/13 → ~166 ms/0; Settings 499 ms/13 → ~188 ms/0; repeated album sheet 972 ms → ~55 ms; second search query 953 ms/27 skeletons → ~443 ms/0 with cached repeats instant.
- **Typecheck:** clean.
- **Lint:** 0 warnings / 0 errors.
- **Production build:** succeeds.
- **Canonical server:** `http://127.0.0.1:3000`.
- **Live Spotify verification (2026-10-27):** `/api/spotify/search?q=weeknd` returned real Spotify results (for example “Starboy” by The Weeknd & Daft Punk), and `/api/spotify/discover` returned a complete 8/8 set of verified albums: The Weeknd – Starboy, Eminem – Rap God, Travis Scott – UTOPIA, OneRepublic – I Ain’t Worried, Coldplay – Parachutes, Daft Punk – Random Access Memories, SZA – SOS, Billie Eilish – Ocean Eyes. A synthetic connected cookie confirmed the route selects the user-token path and logs `(user token)`; the real user-session success was not directly observed from the server console because that requires the browser's authenticated cookies.
- **No deployment has been performed.**
