# Hermes — music in glass

A dark, liminal liquid-glass music player. Hermes pairs an intentionally empty, cinematic atmosphere with a Spotify-first home, a moving-cover onboarding card, real listening history, real Spotify search and, for Spotify Premium users, **in-app Spotify playback** through the Spotify Web Playback SDK.

> **AI / contributor onboarding:** see [`context.md`](./context.md) for the complete current architecture, file map, data flows, queue semantics, motion/performance policy, constraints and verification workflow.

Catalog search uses the connected user's server-side OAuth token when available, with Client Credentials only as the anonymous fallback. Playback uses a one-time user OAuth connection, so clicking a Spotify search result plays inside Hermes. Song rows never send you back to Spotify: playback, queueing and playlist actions all stay in the app.

---

## Highlighted experience

- **Centered top taskbar** — Home, Library, Stats, Search, Import, Connect, Settings and Profile in one centered glass bar. Icon-first, with accessible labels and tooltips.
- **Liquid taskbar selection** — the active taskbar item is marked by one measured glass blob that springs between buttons, stretches in the direction of travel and leaves a fading ghost rim. Items tint as the blob passes, and rapid or reverse selections land on the latest destination. Reduced motion snaps instead of gliding.
- **Cover-lit Home** — when a track is active, the Home backdrop is mixed from its artwork palette: three soft colour washes over the liminal base, drifting on slow transform-only loops. The washes pause with playback and stop entirely under reduced motion.
- **Audio Pulse** — while a track is playing, the Home card, dock bar, floating player and Library collection dialog show a compact live waveform instead of a static play glyph. The Library collection dialog also swaps the currently playing row’s play glyph for the same wave as a playing indicator. In the transport surfaces, its amplitude follows the player’s effective output level: it grows as volume rises, eases down when lowered, and becomes a straight line at mute or zero volume. Hovering or focusing a transport button swaps the waveform for a pause glyph; the action and accessible label are Pause. Spotify’s DRM audio is not exposed to Web Audio, so this is an output-level pulse rather than a decoded-sample FFT.
- **Siri Wave transport** — the full-screen player’s center control is the original WebGL Siri Wave from 21st.dev, widened and adapted to the dark glass palette as a single muted silver-green line: no mint disc, glow or border. The wave advances only while Spotify reports playing, freezes in place on pause, resets its time on every track change and follows the player’s effective volume/mute. The canvas is transparent and sized 200×96 on desktop (160×80 on phones); Previous, Next, Shuffle, artwork, seek and metadata are unchanged. The Play/Pause glyph sits over the wave and fades to hover/focus while playing. Because Spotify’s DRM stream cannot be analyzed, the shader is a procedural animation driven by playback state — not a real audio visualizer.
- **Adaptive rendering** — Hermes checks the renderer and measures real frame pacing after startup and user interactions. If the browser is software-rendering or consistently dropping frames, it automatically reduces large blur, glass backdrop filters and ambient loops while keeping layout, artwork, transport and navigation intact. Brave and Chrome both keep the full look when they render smoothly; `?perf=lite` and `?perf=full` are available as explicit overrides.
- **Home taskbar cards** — while on Home, Library, Stats, Settings, Connect and Profile open as floating glass cards over the home screen instead of navigating away. Switching sections sinks the previous card into the background on a fluid 620 ms lift/submerge transition. Home or the close control returns to the home card; Search and Import keep their floating dialogs; every other route keeps normal navigation.
- **Listening stats** — a taskbar Stats view shows total time listened, tracks played, artists heard, and the top five artists, albums and tracks by actual playback time. Top artists use real Spotify images with an honest initials fallback; rows and summary tiles lift slightly on hover. It opens as a floating Home card and has a dedicated `/stats` route; each browser keeps a local ledger for immediate display and syncs it to the signed-in Spotify account, so Chrome and Brave show the same totals.
- **Sections float over Home** — on Home, pressing Library, Stats or Settings (or the same entries in the Profile menu) raises that section as a floating glass card above the home card instead of leaving the page, so the URL stays `/`. The previous card submerges as the next one rises: it sinks, recedes into depth, blurs and fades into the background over ~620 ms. Home, the card's close button, `Esc` or a click on the dimmed background dismisses it. Sections still exist as real routes, and Search, Import and Connect keep their existing behaviour.
- **Liminal atmosphere** — a cold doorway of light, faint architectural frame, tiled texture, drifting fog, wet-floor artwork reflection, muted artwork and a pale fluorescent accent.
- **Listening-first home** — when nothing is playing, Home shows a centered liquid-glass “Let's dive in” card with a continuously moving row that merges real covers from recent listening with verified curated albums from international artists (The Weeknd, Eminem, Travis Scott, OneRepublic, Coldplay, Daft Punk, SZA, Billie Eilish). The cover strip keeps drifting under the cursor and in lite quality instead of freezing; each cover lifts, zooms and brightens; clicking a cover opens its complete album track list with Play all and per-song playback. The strip can also be grabbed and thrown: pointer velocity carries into a smooth exponential glide that eases to rest, wrapping through the duplicated covers seamlessly and then returning to its ambient drift. Touch devices pause the drift only while the user is touching/scrolling the strip and retain native momentum.
- **Disconnected means empty** — when no Spotify account is connected, Home and Library hide every cover, imported playlist, Liked song, Discover item and artist row. They show a compact “Connect your Spotify account to get started” card with a real Connect Spotify action instead. Imported data stays local and returns after reconnecting, and the taskbar Connect control carries a slow breathing halo until an account is connected.
- **Real artists only** — the home Artists row is built from the user's current Spotify queue and locally remembered listening history, enriched with Spotify artist images and genres. With no real listening data the row is hidden; the demo catalog is never used as a placeholder.
- **Full-screen focus** — the artwork dissolves into a flowing field built from the sleeve itself: two pre-blurred copies of the cover drift and crossfade above four slow ambient colour layers and a full-width wash, so every song gets its own colour layout instead of fixed palette blobs. The field keeps moving while audio plays and settles to a near-still drift when paused; it stops entirely under reduced motion and in lite quality. The artwork, title and transport sit as a centered block, with lyrics to its right and a header toggle that hides the right panel and recenters the album card.
- **Spotify volume** — the full-screen header, the Home current card and the floating mini-player expose mute and a volume slider wired directly to the Spotify SDK. The floating header reveals its slider on hover or keyboard focus so the title stays readable.
- **Dock on demand** — the bottom Spotify bar is hidden during normal Home playback because the listening card owns play, seek and full-screen access. Pressing **Dock player** from the full or floating player explicitly brings the bottom bar back, including on Home; closing it or starting a fresh session returns Home to the card-only layout. It mounts on every other route.
- **Immersive Spotify player** — artwork-derived colour palette, drifting color washes that move independently of each other while playing, film grain, glass rim light and atmospheric depth. All washes freeze when paused in both full and lite quality; lite keeps a reduced transform-only drift while playing.
- **Lyrics on the right** — timestamp-synced lyrics from LRCLIB, auto-scrolling and highlighted against playback. Both automatic line changes and clicks use one cancellable, distance-scaled glide, so the panel moves continuously instead of snapping when it syncs; clicking a line seeks immediately and glides to it. The inactive-line blur stays subtle (0.8 px) so long lyric sheets keep frame rate while scrolling, and manual wheel/touch scrolling never triggers a React render per event. Lookups are bounded: the route fails over within a few seconds and the panel leaves its skeleton with a Retry instead of waiting indefinitely. If LRCLIB is temporarily down, the panel keeps a plain fallback only briefly and retries in the background, then swaps to timed lyrics when the service recovers. The lyrics control is hidden entirely when a track has no lyrics. Lyrics for the current track are prefetched as soon as playback starts, so opening the full player shows them without a loading skeleton.
- **Instant phase changes** — pressing play shows the player and selected track immediately even while the Spotify SDK is still connecting; the request starts as soon as the device is ready. Home section chunks warm on taskbar hover and at idle, cover album sheets prefetch on hover and cache for five minutes, and search keeps the previous results visible while re-querying with a 60-second query cache. There are no “Checking account…” or “Starting playback…” waiting toasts.
- **Quick queue on Home** — a small glass Q floats on the Home listening view’s right edge while a track is active. Pressing it slides out a compact, cover-tinted queue card (no page-width takeover) that shows the real up-next order and lets you search Spotify inline to add songs. Press Q again, Escape, or anywhere outside the card and it slides back to the single-button form. The full-screen player keeps its existing Queue side panel.
- **Minimise to a floating player** — draggable glass card with artwork, title, artist, progress and transport.
- **Focused search** — an aurora-rim glass search field on Search and in the `Ctrl/Cmd+K` palette, with no suggestion chips; live Spotify results with explicit play, queue and playlist actions.
- **Add to Playlist** — every song row (search, command palette, library collections and album sheets) carries one list-plus action. It lists the editable playlists in your Spotify account, supports filtering, and can create a new playlist and add the song in one step. New playlists appear in the Hermes library immediately; accounts connected before playlist editing shipped are asked to reconnect once for the new scopes.
- **Real Spotify search** — live tracks, artists and albums with artwork, metadata and durations.
- **In-app Spotify playback** — with a connected Premium account, clicking a Spotify result starts playback in the Hermes Spotify bar. It expands into the immersive full-screen player and floats as a draggable mini player. The bar is hidden on Home so the listening card owns transport there.
- **Spotify-compatible two-layer queue** — albums, artist plays and playlists start as explicit ordered track queues with a context label. The queue mirrors Spotify: “Next in queue” holds manual additions and always plays before “Next from: <context>”, and when the manual queue empties the collection continues where it would have. New additions appear instantly and Spotify confirms them in the background; the SDK’s `next_tracks` remains authoritative, duplicate tracks advance forward, and the Home drawer, full-player panel and Library Queue tab show the same two sections.
- **Native Spotify shuffle** — the Library collection and album dialogs include a Shuffle action that starts the chosen collection and enables Spotify’s device shuffle. The player’s Shuffle control calls the native endpoint directly, keeps the current track playing, and flips only after Spotify accepts. The button then mirrors `shuffle_state` from Spotify (including changes made in another client). No local shuffle order is invented; the queue follows the device’s real state.
- **Last.fm-compatible scrobbling** — a local eligibility engine applies the official per-track rules: tracks must be longer than 30 seconds, the threshold is half the duration capped at four minutes, and unknown durations use a safe four-minute fallback without inventing a length. The recorded timestamp is when the track started playing, not when the threshold was crossed. Eligible plays are stored in a browser-local ledger; no Last.fm API, account or credentials are required.
- **Library import** — a taskbar Import button opens a dialog that pulls Spotify playlists and liked songs via the user's account. Imports paginate the complete library and persist in the Hermes library.
- **Library workspace** — a fixed-height two-pane glass Library. The complete playlist collection scrolls inside the dominant left pane while the right pane stays exactly bottom-aligned with Now Playing, real Recently Played history and the active queue. Search, All/Playlists/Albums/Artists filters, recent/A–Z sorting, derived album/artist collections and the existing floating song dialog are all driven by real imported Spotify data.
- **Real listening history** — the Library side panel and Home covers use tracks actually played through Hermes, stored per browser; the old demo catalog is no longer exposed.
- **Real settings** — Spotify connection, Premium and live player status, motion and lyric preferences, real listening-history clearing and a complete local-data reset.

Keyboard: `Space` play/pause, `←`/`→` seek 5s in full screen, `M` float, `Ctrl/Cmd+K` search, `Esc` close.

---

## Install the Windows app

1. Open this repository's **Releases** page and download `Hermes-0.1.0-win32-x64.zip`.
2. Extract the zip anywhere and run `Hermes.exe`. No Node.js installation is required.
3. Create your own Spotify app (see [Spotify Dashboard setup](#spotify-dashboard-setup)) and save its credentials to `%APPDATA%\Hermes\hermes.env`:

   ```env
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:47100/api/auth/spotify/callback
   ```

4. Restart Hermes and choose **Connect**.

Playback requires Spotify Premium; search and library browsing work with a free account.

## Run from source

Requires Node 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Spotify credentials to `.env.local`:

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
# optional search market
SPOTIFY_MARKET=US
```

> `.env.example` is a template and is **not loaded by Next.js**. Keep real values in `.env.local` (gitignored) or deployment environment variables. Never prefix them with `NEXT_PUBLIC_`.

### Spotify Dashboard setup

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app and add the exact callback URL from `SPOTIFY_REDIRECT_URI`:

- `http://127.0.0.1:3000/api/auth/spotify/callback` for running from source.
- `http://127.0.0.1:47100/api/auth/spotify/callback` for the packaged Windows app.

Spotify no longer accepts `http://localhost` redirect URIs — that field reports “This redirect URI is not secure.” Use the loopback IP `127.0.0.1` locally, or an HTTPS URL in production. Hermes authorizes against `SPOTIFY_REDIRECT_URI` whenever the request is loopback, even if Next.js started on another port (for example `3002`). The login hop runs on the configured port and the callback returns you to the port you started from, so only the configured URL needs to be registered. The port is part of the match: if the URI is not registered exactly, Spotify shows `redirect_uri: Not matching configuration`.

After saving the redirect URI, open the app at `http://127.0.0.1:3000` (or any loopback port) and connect from Settings. Opening `localhost` is redirected to the loopback IP before hydration, so Chrome, Brave and every tab share one cookie jar. OAuth state cookies are kept per attempt for 30 minutes, so retrying in another tab or leaving the Spotify login page open no longer invalidates an earlier attempt.

**Playback requires Spotify Premium.** Search works without Premium. Web Playback SDK support depends on the browser (EME/Widevine support required).

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Oxlint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright browser tests |
| `npm run desktop` | Build and launch the Electron desktop shell |
| `npm run desktop:run` | Launch the desktop shell against the existing build; starts the local server if needed |
| `npm run desktop:dev` | Launch the desktop shell against a running dev server on `127.0.0.1:3000` |

Browser tests mock both the Spotify Web API and the Web Playback SDK, so they need no credentials, Spotify login or Premium account.

---

## Desktop development shell (always-on-top floating player)

A website cannot draw its own in-page card over other applications, so Hermes includes a local Electron shell for the original floating card:

```bash
npm run desktop
```

- The main Hermes window is the Spotify playback device.
- **Audio requires Widevine.** Spotify's Web Playback SDK decodes DRM-protected streams through the Widevine CDM, which the stock Electron runtime does not include. Hermes probes EME before initialising the SDK and reports the limitation instead of leaving a silent player at 0:00. Playback is fully functional in Chrome/Brave; audio inside the desktop shell needs a Widevine-enabled Electron runtime (castLabs Electron for Content Security with VMP signing).
- Press **Float** / **Minimize** in the full player or dock, or the pop-out control on the floating card, to open the original glass card in a **frameless, content-sized, always-on-top** window. The window itself is transparent and exactly the card size, so only the rounded opaque card is visible — no Windows frame, bezel, padding or resize grip. The whole card (outside its buttons, sliders and links) is a drag surface implemented over IPC; there is no `-webkit-app-region`, so dragging never swallows button clicks.
- Drag the card anywhere; it stays above other apps. Previous, play/pause, next, volume, expand, dock and close work through the same playback provider via a `BroadcastChannel` bridge; no second Spotify SDK device is created.
- The float only renders live state. The provider broadcasts on every change plus a 1-second heartbeat; if the beat stops (main window reloaded, crashed or closed) the card switches to “Hermes is not connected” instead of showing a cached track, and the old cached snapshot is never restored. Opening `/desktop-floating` in a normal browser shows a desktop-only message.
- Expand opens the full player in the main window and closes the float; dock returns the main window to the dock bar; closing the float leaves the main window running.
- The desktop app has its own Electron session; connect Spotify once from the desktop window.
- `desktop:run` uses the existing production build and starts its own `next start` server when no server is listening. It requires a build (`npm run build` or `npm run desktop`) and shows a clear error if `.next/BUILD_ID` is missing.
- `desktop:dev` is **connect-only**: it waits up to 30 seconds for a running `npm run dev` at `127.0.0.1:3000` and never starts a production server under it. If no dev server is reachable, it shows a clear “start npm run dev first” error.
- This is a local development wrapper (requires Node and the project folder), not a packaged installer. A distributable `.exe`/installer needs packaging and explicit deployment approval. The browser app uses only the in-page floating card; it has no Document PiP player.

### Windows release (portable zip)

```bash
npm run release:win   # build + assemble
npm run release:sign  # castLabs EVS VMP signature + final zip
```

Produces `release/Hermes-0.1.0-win32-x64.zip` — extract it and run `Hermes.exe`. The zip contains the full web UI served by a bundled Next.js server, the Electron always-on-top float, the Hermes window icon, and `hermes.env.example`. No Node.js installation is required.

- **Runtime:** the release is assembled on the **castLabs Electron for Content Security** runtime, which installs the Widevine CDM on first launch. That allows Spotify audio to reach the renderer; the stock Electron runtime used by `desktop`/`desktop:dev` cannot play DRM audio and reports it instead of playing silently.
- **VMP signing is required for audio.** Without a castLabs EVS signature, Spotify's `api.spotify.com/v1/widevine-license/...` edge answers with intermittent `500`s and playback pauses/skips for the first seconds. With the signed `Hermes.exe`, license requests return `200` and playback is continuous (verified live). `npm run release:sign` signs the assembled folder, copies the production signature to `Hermes.exe.sig`, verifies it, removes test artifacts and writes the final zip. It needs Python with `pip install castlabs-evs` and a confirmed EVS account (`python -m castlabs_evs.account signup` then `confirm-signup`); set `HERMES_PYTHON` if Python is not on `PATH`.
- **Build prerequisites:** download `electron-v44.9.3+wvcus-win32-x64.zip` from [castLabs electron-releases](https://github.com/castlabs/electron-releases/releases) into `%LOCALAPPDATA%/hermes-release/castlabs/dist`, and `rcedit-x64.exe` v2.0.0 into `%LOCALAPPDATA%/hermes-release/`. Set `HERMES_RELEASE_CACHE` to override the cache folder. `HERMES_BRAND_RCEDIT=1` re-enables exe icon branding; branding must precede EVS signing.
- **App icon:** `npm run icons` regenerates `desktop/assets/icon.ico` and the PNG set from `public/favicon.svg`. The release brands the Electron host **before** EVS signing (`HERMES_BRAND_RCEDIT=1`), so `Hermes.exe` carries the Hermes icon and a valid production signature.
- **Per-user credentials:** each user creates their own Spotify app and puts `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in `%APPDATA%/Hermes/hermes.env` (a `hermes.env` next to the exe is migrated there on first run). Never ship your own secrets. The redirect URI must be `http://127.0.0.1:47100/api/auth/spotify/callback` exactly. Rebuilding the release preserves an existing `hermes.env` in the release folder.
- **GitHub release:** upload the zip as a release asset, for example:
  ```bash
  gh release create v0.1.0 release/Hermes-0.1.0-win32-x64.zip \
    --title "Hermes 0.1.0" --notes "First portable Windows build."
  ```
  Publishing requires a GitHub repository and explicit approval; the build step stays local.

---

## Spotify integration

### Search: request-scoped Spotify token

```
Browser → /api/spotify/search → user access cookie (connected) → api.spotify.com/v1/search
                              ↘ Client Credentials (anonymous fallback)
```

- A connected user's request uses their httpOnly Spotify access token. Expiring tokens are refreshed server-side and the new cookies are written onto the search response.
- The app-wide Client Credentials token is only used when there is no user session. This prevents the shared app quota from blocking search for every connected account.
- The client secret and provider tokens never reach browser JavaScript.
- Responses are validated with Zod and reduced to public metadata before leaving the server.
- Search results are cached for 60 seconds across API instances; the cache key includes the token mode, query, limit and market.
- Search supports tracks, artists and albums (limit 6 each).

### Playback: user OAuth + Web Playback SDK

```
Browser → /api/auth/spotify/login → accounts.spotify.com/authorize
        ← /api/auth/spotify/callback (authorization code + state)
Browser → /api/spotify/token → short-lived user access token (SDK only)
Browser → Spotify Web Playback SDK → audio through Hermes
```

- A one-time authorization grants `streaming`, profile, playback state/control, playlist-read, playlist-modify and user-library-read scopes. Library import and playlist editing ask for a reconnect if the existing token predates those scopes.
- Access and refresh tokens are stored in **httpOnly** cookies. The refresh token and client secret are never returned to client JavaScript.
- The SDK receives the user's short-lived access token from `/api/spotify/token`, which refreshes it server-side when needed. This is required by the Web Playback SDK; the access token is not a client secret.
- Search clicks no longer navigate away. They call the SDK and show a Spotify player bar with artwork, track/artist metadata, seek, previous, play/pause, next and close.
- The bar expands into a full-screen Spotify player with an artwork-derived backdrop, large artwork, metadata and transport. Minimize turns it into the draggable floating card; docking returns to the bar. Playback continues through every view.
- Song rows carry only in-app actions: play, queue and add to playlist. There are no provider redirect icons in lists or cards.
- If Spotify is not connected, a Connect prompt appears **before** any Spotify redirect. If the account is Free, a Premium-required prompt appears. No per-song redirect is used.
- Closing the Spotify player pauses playback. The visible app is Spotify-only; legacy demo routes redirect to Search or Library.

### Access restrictions

- **Spotify Premium is required for in-app playback** through the Web Playback SDK. There is no legitimate workaround; the UI explains this for Free accounts.
- **Client Credentials cannot play audio or read user data.** Connected catalog searches use the user OAuth token; Client Credentials only covers public catalog access for anonymous requests.
- **Development Mode** Spotify apps must have the logging-in user added to the app's user allowlist. App owners are normally allowed.
- **Redirect URI** must be registered exactly, including port. The canonical dev callback is `http://127.0.0.1:3000/api/auth/spotify/callback` (the value in `.env.local`). Spotify rejects `http://localhost` as insecure; Hermes redirects localhost pages to the loopback IP before hydration and starts OAuth on the canonical origin, then returns you to the original loopback port. Transient Spotify token and profile failures are retried before the connection is reported as failed.
- Some browsers/environments do not support the Web Playback SDK's DRM requirements; Hermes surfaces an initialization notice.
- Spotify rate limits are forwarded as `429` with `Retry-After`; playback and search errors are displayed with a retry or reconnect action.

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/spotify/search?q=…` | Server-side public catalog search |
| `GET /api/spotify/status` | Configured/not-configured (no secrets) |
| `GET /api/spotify/session` | Connected profile, Premium state (no tokens) |
| `GET /api/spotify/listening` | Current queue artists for the Home row (user session; no tokens returned) |
| `GET /api/spotify/artists?name=…` | Cached real artist images for up to five Stats artist names |
| `GET /api/spotify/import` | Playlists and liked songs for the signed-in user (library scopes) |
| `GET /api/spotify/album?track=…` | Complete album details and track list for a recently played track |
| `GET /api/spotify/album?album=…` | Complete details and track list for a curated album cover |
| `GET /api/spotify/artist?id=…` | Ordered artist top tracks for explicit queue playback |
| `GET /api/spotify/artist-detail?id=…` | Artist profile, images and metadata, with a Client Credentials fallback |
| `GET /api/spotify/playlists` | Editable playlists for the signed-in user |
| `POST /api/spotify/playlists` | Add a track to a playlist, or create a playlist and optionally add the track |
| `GET /api/lyrics?track=…` | Timed or plain lyrics from LRCLIB with fallback and short retryable cache |
| `GET /api/spotify/token` | Short-lived user access token for the SDK |
| `GET /api/auth/spotify/login` | Starts user OAuth |
| `GET /api/auth/spotify/callback` | Server-side code exchange |
| `POST /api/auth/spotify/logout` | Clears the Spotify session |

Search errors: `400` invalid query, `429` rate limited, `502` credential/API failure, `503` not configured.

---

## Verify locally

1. Put valid credentials in `.env.local` and register the exact callback URL in the Spotify Developer Dashboard.
2. Start `npm run dev` and open **Settings → Connections**.
3. Click **Connect** and authorize Hermes. If the account is Premium, Settings shows **Premium** and a Disconnect button.
4. Open **Search** (or `Ctrl/Cmd+K`), search for a track, and click the row.
   - The URL must remain `/search`.
   - The Hermes Spotify bar must appear with artwork, title, artist and transport controls.
   - Audio must play through the page.
5. Use the list-plus action on a row to add the song to a playlist, or create a new playlist in the dialog.
6. If the account is Free, repeat and confirm the Premium-required prompt; no audio should start.
7. Check API responses:
   ```bash
   curl -s http://localhost:3002/api/spotify/status
   curl -s "http://localhost:3002/api/spotify/search?q=afterglow"
   curl -s http://localhost:3002/api/spotify/session
   ```
   The search/session responses must not contain a refresh token, client secret or access token.
8. In DevTools → Network, verify the client secret is never present in browser requests or responses. The user access token is delivered only to the SDK through `/api/spotify/token`; auth cookies are `HttpOnly`.
9. Run `npm test` and `npm run test:e2e`.

The automated browser tests cover the in-app click path with a mocked Web Playback SDK, the Connect prompt and the Premium prompt. Real audio requires your Spotify login and a Premium account, so that final manual step cannot be automated with app credentials alone.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx, album/[id], artist/[id], playlist/[id]
│   ├── search, library, settings (legacy demo routes redirect)
│   ├── api/auth/spotify/login | callback | logout
│   ├── api/spotify/search | status | session | token | listening | import | discover
│   ├── api/lyrics            # LRCLIB lookup with in-memory cache
│   └── error.tsx, not-found.tsx
├── components/
│   ├── layout/                # Shell, centered top taskbar, toasts
│   ├── home/                  # Current-track card, queue, floating section stage

│   ├── player/                # Local dock/now playing + SpotifyPlayerBar
│   ├── providers/             # AppRuntime, SpotifyPlaybackProvider
│   ├── search/                # Spotify result rows/cards, notices, skeletons
│   ├── common/                # Cards, section rows, command palette
│   └── ui/                    # Liquid primitives
├── lib/
│   ├── catalog/               # Legacy bundled demo catalog (redirected from UI)
│   ├── playback/              # Local simulated playback provider + queue
│   ├── spotify/               # Search client, OAuth, secure cookies, types
│   ├── providers.ts           # Legacy local playback registration
│   └── utils.ts
├── hooks/                     # useSpotifySearch, useTrackLyrics, useScrolled, environment hooks
├── store/                     # Zustand stores
└── tests/                     # Vitest + Playwright
```

### Shell, components and motion

- There is no layout sidebar. `TopBar` is the only primary navigation at every breakpoint: one centered floating taskbar with Home, Library, Search, Import, Connect, Settings and Profile. It stays icon-first with accessible labels and tooltips, and the page content uses the full width below it.
- The taskbar selection is one absolutely-positioned glass blob driven by spring physics in `src/lib/nav-liquid.ts`. It measures the active control with `ResizeObserver` plus nav scroll offsets, springs its center between items, stretches up to 26 px in the direction of travel, and leaves a slower, fading ghost rim. Items under the moving material brighten to the active white as it passes, so intermediate destinations tint during a jump and only the destination remains hot at rest. Rapid selections retarget the same spring with no duplicate highlights. Reduced-motion (Hermes setting or OS preference) snaps instantly and removes the trail. Route changes, Home cards and the Search/Import dialogs all drive the same selection state. On Home, Library, Settings, Connect and Profile raise floating cards; the URL stays `/` and the previous card submerges. Off Home, navigation is unchanged.
- Connect starts the account OAuth flow when disconnected, or opens Settings when connected. Search opens the command palette, Home and Library navigate, Settings is a direct link, and Profile opens a working menu. While the session is configured but disconnected, the Connect control gets a small breathing mint halo; it is removed as soon as an account is connected, and the profile status dot is only shown for a connected account.
- The bottom dock is intentionally absent on Home: the listening card owns transport and opens the full player, while the dock mounts on all other routes. `PlayerLayer` keeps the full-screen and floating players unaffected, so minimise/expand still works from Home.
- The **Efferd UI** floating header pattern and `ProgressiveBlur` edge-fog component from 21st.dev are adapted from the author's MIT-licensed repository (`sshahaider/efferd-ui`). The 21st.dev registry install endpoint requires an API key, so no key or paid service was added; both open-source implementations were rewritten for the existing tokens and React structure.
- Rendering quality is adaptive. `AppRuntime` checks the WebGL renderer for software rasterizers and samples frame pacing at startup and after pointer, keyboard and wheel interactions. Sustained sub-48 fps or a high rate of >32 ms frames sets `html[data-quality="lite"]`; that tier keeps the same layout and palette but removes large backdrop filters, redundant big blur layers, ambient loops and the marquee scroll. A smooth renderer stays on `full`. Query overrides are available for support and testing.
- Spotify OAuth keeps one state cookie per pending attempt instead of a single shared cookie, gives each attempt 30 minutes to complete, and retries token/profile calls on network errors, `429` and `5xx` responses. Localhost pages canonicalize to `127.0.0.1` before hydration, so tabs and browsers cannot end up split across two cookie jars.
- The liminal scene is composed in `AmbientBackdrop`: doorway light, architectural frame, tiled grid, floor threshold, haze, grain, slow fog and a bottom progressive-blur veil. The home card adds a wet-floor reflection. `HomeCoverBackdrop` layers the active track's extracted palette over that scene only on Home, with two elliptical washes, a waterline and a dark veil; every layer animates transform-only and pauses with the player.
- The Home, dock, floating and Library transports use the shared `AudioPulse` mark instead of a static pause icon while audio runs. The bars have independent durations and negative delays, so they never loop in visual lockstep; reduced motion swaps the wave for fixed staggered heights. The full-screen transport instead uses the Siri Wave: a WebGL canvas whose elapsed shader time advances only while `isPlaying`, resets from the track ID, and scales its amplitude from the effective output level. Pausing freezes the shader in place; paused the canvas shows a calm line beneath the Play glyph.
- Full-screen and mini-player surfaces share a `view-transition-name`; opening, minimising and docking use the browser View Transitions API for a continuous artwork morph when supported, with a normal state change as fallback.
- Streamed lyrics come from the free LRCLIB search API through the server-side `/api/lyrics` route, with a six-hour in-memory cache. Lookups first request the exact duration match, then split collaborator credits, strip feature/remaster noise from titles, and score candidates by title, artist, album and duration. A synced candidate always wins over a plain one; unsynced lyrics are only used when no timed version exists. The route is bounded to a 4 s total budget, stops calling LRCLIB after the first upstream failure, and falls back to a plain-lyrics service within 1.5 s. The route retries transient failures, and the panel labels plain lyrics as unsynced. No key or account is required.
- Preserved motion inventory: ambient orb drift, cursor light, sheen, page entry, artwork hover scale, liquid control transitions, equalizer bars, skeleton shimmer, now-playing background pan, sheet/scale transitions, tooltip and popover motion. Reduced-motion and reduced-transparency fallbacks remain intact.
- The newer motion is transform/opacity plus width/height on the tiny 40 px taskbar blob; no filter, blur or blend is added to any large animated layer.

### Performance

Production Lighthouse (Lighthouse 13.5.0, Chrome 156 headless, clean profile):

| Metric | Supplied report (dev server) | Production desktop | Production mobile |
| --- | --- | --- | --- |
| Performance | 62 | **100** | **94** |
| Accessibility | 100 | **100** | **100** |
| Best practices | — | **100** | **100** |
| SEO | — | **100** | **100** |
| LCP | 6.9 s | **0.7 s** | 3.1 s |
| FCP | 0.5 s | **0.3 s** | 0.9 s |
| TBT | 310 ms | **0 ms** | 30 ms |
| CLS | 0.00 | **0.00** | **0.00** |
| Transfer | 12,439 KiB | **565 KiB** | **430 KiB** |

- The supplied report was generated against `next dev`. Its unused/minification JavaScript and HMR endpoint are development artifacts; its remaining JavaScript diagnostics were injected by the Dark Reader extension. The production build ships 197 KiB of JavaScript, and clean-profile `unminified-javascript` / `unused-javascript` audits pass.
- Spotify covers and artist images are requested at their ~300 px variants for the Home marquee, Library and search rows; the idle card therefore loads real covers without the full-resolution album art. Curated initial covers are resolved to verified artist albums (search → artist albums), deduped by album ID, and cached for an hour; partial results are cached for five minutes and failures back off for 60 seconds.
- Inter, Inter Tight and Instrument Serif are self-hosted as variable Latin WOFF2 files with explicit `<link rel="preload">` tags. This removes the Google Fonts request and shortens the document → CSS → font dependency chain.
- The Spotify Web Playback SDK loads on the first play action instead of on every connected page view. That removes ~180 KiB and the third-party cache-lifetime finding from the initial load.
- `/fonts/*` and `/artwork/*` are served with long-lived cache headers (one year and 30 days respectively, with stale-while-revalidate).
- The app CSS is one 16 KiB render-blocking stylesheet. `experimental.optimizeCss` with critters produced no change and full `inlineCss` was measured at **79 mobile / 320 ms TBT**, so the external stylesheet is kept.
- The remaining 12 KiB `legacy-javascript` insight is Next.js's baseline polyfills for older browsers; removing it would drop supported browser versions for no performance-score gain.
- The mini-player title and artist links have 24px hit areas, keeping accessibility at 100.

### Search boundary

The Spotify search route maps Spotify responses into sanitized `SpotifyTrackResult`, `SpotifyAlbumResult` and `SpotifyArtistResult` objects. It uses its own result types rather than pretending Spotify tracks are local playable catalog tracks.

### Playback boundary

The visible app is Spotify-first. `SpotifyPlaybackProvider` owns the SDK player, start/seek/transport/volume calls, connection prompts and now-playing state. It also advances the local scrobble session from measured listening progress. The old local demo routes redirect to Search or Library and the local player is no longer rendered; its code remains only for bundled tests and fallbacks.

### Security

- `server-only` guards the credentials, OAuth and Web API modules.
- Cookies: `hermes_spotify_access`, `hermes_spotify_refresh`, `hermes_spotify_expires`, `hermes_spotify_profile`, plus one `hermes_spotify_oauth_<state>` cookie per pending OAuth attempt; all `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. The per-attempt state cookie avoids a retry or second tab overwriting an earlier login.
- OAuth state is random and verified server-side. Return paths are allowlisted to prevent open redirects.
- The client secret is never sent to the browser; the refresh token is never returned in JSON.
- Search data is validated with Zod before mapping.
- Spotify access tokens are refreshed server-side and only exposed to the Web Playback SDK as required by Spotify.

---

## Persistence

| Storage | Contents |
| --- | --- |
| `hermes.spotify.history.v1` (localStorage) | Recently played Spotify tracks for Home covers |
| `hermes.spotify.artists.v1` (localStorage) | Real artist history for the Artists row |
| `hermes.library.imported.v1` (localStorage) | Imported Spotify playlists and liked songs |
| `hermes.settings.v1` (localStorage) | Motion preference, lyrics scale |
| Spotify cookies (httpOnly) | User tokens and public profile for playback |

Listening history is per browser and is not synced to the Spotify account. The legacy local library/player keys are no longer surfaced by the visible app. Imported playlists and history are retained locally when the account is disconnected, but Home and Library are emptied until it is reconnected.

---

## Limitations

- In-app Spotify playback requires a **Premium** account, a supported browser, and a completed OAuth connection.
- The packaged build is **Windows x64 only**. macOS/Linux users can run the web app from source.
- There is no native mobile app yet. The phone layout is the responsive web UI; iOS/Android cannot host Spotify's Web Playback SDK the way desktop browsers do, so a future mobile build would act as a remote control for an active Spotify session rather than a standalone player.
- Streamed lyrics depend on community lyric coverage. The route requests an exact duration match first, then tries full and primary artist credits, cleaned titles and scored matches, always preferring synced results; plain lyrics remain a last-resort fallback before reporting a miss, and service outages surface a retry state instead of a false “no lyrics”.
- Spotify's Player API does not expose queue reorder or removal endpoints. Hermes keeps manual additions in their own "Next in queue" layer ahead of the context's "Next from" list and renders the SDK's actual upcoming window, so the visible order and the Next button always agree; Spotify remains the owner of queue order.
- Free accounts get the Premium prompt; no workaround is attempted.
- Spotify playlist/liked-songs import needs `playlist-read-private`, `playlist-read-collaborative` and `user-library-read`. Add to Playlist needs `playlist-modify-private` or `playlist-modify-public`. Reconnect once after upgrading if the old token predates these scopes. Imports cover the full library (all playlists and saved songs) per run.
- Home covers always merge recent Hermes listening with verified curated real albums from international artists; a large history never suppresses the curated set. The browser-local history is per device.
- Search results are not persisted. Recent listening history and the local scrobble ledger are per browser; listening stats sync to the signed-in Spotify account.
- Development Mode apps may require the user to be allowlisted in the Spotify Dashboard.
- Handled: the legacy demo catalog is no longer exposed; its routes redirect to Search or Library.
- Remaining polish from the 2026-10-28 audit: some 9–10px secondary metadata is still intentionally very dim, and a few icon-only clear/dismiss controls have a ~20px visual hit area. Home floating cards restore focus on close but do not inert the dimmed page behind them; modal dialogs do trap and restore focus. The cover strip intentionally ignores OS `prefers-reduced-motion` per the product's continuous-motion requirement; Hermes's own Reduce motion setting stops it, and lite ambient CSS now honors reduced motion.

---

## Verification performed

- `tsc --noEmit` — clean
- `npm run lint` — zero warnings
- `npm test` — **272 unit tests passing** (library collection/artwork derivation, search client, user-token routing/refresh, SDK queue mapping/pending manual additions/duplicate-recording resolution, native shuffle request handling, cached real artist-image and artist-profile lookup with credentials fallback, OAuth helpers including per-attempt state and transient retries, auth/token/session routes, cookies and scopes, playlist listing/create/add routes, performance-tier detection, lyrics lookup including synced preference, exact-failure recovery, primary/clean title queries, retryable cache and refresh, lyric scroll distance timing/easing, mapping, rate limits, import pagination/partial failures/scopes, verified curated album discovery/caching, Home cover merge/dedupe, imported store persistence, nav spring physics/stretch/tint/retargeting, listening-stats accumulation/ranking/formatting, account-stats normalization/merge/store/route sync, Last.fm-compatible scrobble thresholds/session timestamps and local ledger validation/dedupe)
- `npm run test:e2e` — **113 Playwright tests passing (Chrome)** on the full feature run (the final redirect-removal and row-surface tweaks were rechecked with the affected specs), including the full-player Siri Wave following play, pause, volume and track changes, explicit Home docking to the bottom player bar, paused full-player palette freeze in lite quality, full search from the palette with `?q=` handoff and short-query guidance, a keyboard-navigable profile menu, Connect returning to Library/Stats, Settings appearance/clear/reset flows, stable dialog focus with nested Escape, a clean console sweep across all primary routes, phone layouts for Settings/Search/Stats, the reset dialog and the full player, instant first-play feedback while the SDK connects, prefetched lyrics before the full player opens, hover-prefetched and cached album sheets, stale-while-revalidate search with cached repeats, preloaded Home Stats/Settings cards without a chunk skeleton, Library equal-bottom columns with 10/30/300 playlists, search/filter/sort, the live Library side player, the playing-row Audio Pulse in the collection dialog, the Library shuffle action starting the playlist with Spotify's native shuffle request and the playing-row pulse intact, crisp cover hover chips with no backdrop blur, the Stats card/page with real artist images, hover lift, no bars/caption and playback-time tracking, account stats rendered from the merged server ledger with an empty local ledger, a 31-second track recording its scrobble at the dynamic 15.5-second threshold with the play-start timestamp, the taskbar’s far-jump stretch, single landing, rapid retargeting and reduced-motion behavior, automatic connected-library sync plus distinct loading/reconnect/empty/retry states, curated Home albums alongside a full listening history, explicit ordered album queues, SDK-authoritative queue ordering with Next playing the displayed track after two manual additions, every manually queued song staying visible when the SDK next window is truncated to one row, a native Spotify shuffle toggle that never replays the queue and keeps its confirmed mode after a failure, native Next/Previous where two seconds into a song Previous restarts it and from the start it walks back instantly without a play request, and a manually queued list walking correctly with Next and Previous, lyric lines switching within 300ms of their true playback time between position samples, automatic recovery from an unsynced fallback when timed lyrics arrive, the floating Q quick queue on Home with 420ms slide-in, playable queue rows, inline search-to-add and Q/Escape/outside collapse, adding a song to an existing playlist and creating a new one, duplicate-release Next navigation without a false “Could not skip” error, floating-player mute and hover-reveal volume, Spotify import into the Hermes library, playable Home covers, throwable cover-strip momentum, connect-first empty states and the breathing Connect halo, floating Home taskbar cards with the submerge transition, cover-lit Home backdrop motion, the full-player field adopting each sleeve's own blurred layout and drifting with no palette blobs, Audio Pulse waveform motion and mute flatline, lite-effects fallback, loopback host canonicalization, mobile stage overflow, full playlist rendering, distance-scaled lyric seek scrolling without a jump, continuous auto-follow lyric motion with no backward snaps, warm fresh-region lyric scrolling staying under 60 ms p95 / 90 ms max frame time while the wave animates, hiding the lyrics control when lyrics are missing, Home cover-strip motion across reduced-motion, lite-quality, hover, touch and post-flick contexts, search results and queueing, Spotify volume/mute, listening artists, command palette navigation, mocked in-app playback and full-screen/floating transitions
- Software-rendered performance check (GPU disabled, Chrome and Brave): Home and Library recovered from **11/6 fps to about 60 fps**, and the full player from **6 fps to about 60 fps** after adaptive lite mode engaged
- Instant-phase measurements (production build, Chrome): first-play feedback with a deliberately delayed 1.5 s SDK ready **1486 ms → 65–76 ms**; full-player lyrics **946 ms → about 60 ms**; Home Stats **659 ms → about 166 ms**; Settings **499 ms → about 188 ms**; repeated album sheet **972 ms → about 55 ms**; second search query **953 ms → about 443 ms**, with cached repeats instant
- Full release audit (2026-10-28): every primary route, taskbar control, overlay, playback surface, keyboard path and phone layout was exercised. The console sweep is clean; a live `/search?q=weeknd` returned six real tracks, six albums and six artists with no console errors. **87 Playwright tests** pass in both Chrome and Brave; **210 unit tests**, typecheck, lint and production build are clean. Real Spotify audio still requires the user's own Premium login and was verified through the mocked SDK, not by automating a real account.
- `npm run build` — production build succeeds
- Production Lighthouse (desktop preset): **100 Performance, 100 Accessibility, 100 Best Practices, 100 SEO**; LCP 0.7 s, FCP 0.3 s, TBT 0 ms, CLS 0, 565 KiB total
- Production Lighthouse (mobile preset): **94 Performance, 100 Accessibility, 100 Best Practices, 100 SEO**; LCP 3.1 s, FCP 0.9 s, TBT 30 ms, CLS 0, 430 KiB total. Mobile runs vary with host CPU load (77–94 observed); desktop is stable at 100.
- Lighthouse cache-lifetime, unminified-JavaScript, unused-JavaScript and third-party insights pass on the clean production profile; the remaining render-blocking and legacy-JavaScript items are documented above
- Lighthouse `image-delivery-insight` scored 1 with no remaining image savings; the baseline 9,423 KiB opportunity is resolved
- Live Spotify catalog verification: `/api/spotify/search?q=weeknd` returned real Spotify results (including “Starboy” by The Weeknd & Daft Punk), and `/api/spotify/discover` returned a complete 8/8 curated set — The Weeknd “Starboy”, Eminem “Rap God”, Travis Scott “UTOPIA”, OneRepublic “I Ain’t Worried”, Coldplay “Parachutes”, Daft Punk “Random Access Memories”, SZA “SOS”, Billie Eilish “Ocean Eyes”. The connected user-token path was verified through route tests and a live synthetic-cookie request that logged `(user token)`.
- Streamed lyrics verified against current catalog tracks (including multi-artist credits) and an instrumental; the full player was measured at 1920×1080 and 1440×1000 with artwork, title, transport and lyrics panel on shared axes
- Spotify authorize URL built for `http://127.0.0.1:3000/api/auth/spotify/callback` (loopback IP; Spotify rejects localhost), including the cross-port login hop from `3002`
- Client static bundles contain no client ID, client secret, refresh-token cookie name or Basic auth string
- Optimized Spotify cover sizing and self-hosted fonts visually verified on the production Home and Library pages
- Audio Pulse and the full-player Siri Wave cannot read Spotify's DRM-protected decoded audio: the Web Playback SDK renders audio inside a cross-origin EME iframe, and Web Audio would output silence for that protected media. Audio Pulse is driven by the app's effective output volume/mute; the Siri Wave is a procedural GLSL animation whose clock runs only during playback and whose amplitude also follows that output level. Neither is an instant-by-instant analysis of the song, and neither is described as a real audio visualizer. True FFT amplitude would require an explicit tab/system audio-capture permission.
- The Siri Wave needs WebGL. If the browser cannot create a WebGL context, the canvas renders empty; the same button still exposes the Play/Pause glyph and its accessible action. There is no audio-context teardown beyond unmounting the canvas, and the original 21st.dev component's context-loss restore hook is not included.
- Real audio playback requires the final manual Spotify login and a Premium account; the UI and routes are covered with mocks

## License

MIT — see [`LICENSE`](./LICENSE). Bundled artwork was created for this repository; no commercial audio is included.

Third-party code, fonts, services and runtime notices are listed in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
