# Third-party notices

Hermes is MIT-licensed (see `LICENSE`). It depends on third-party software, fonts and services that keep their own terms.

## Adapted source code

- **Siri Wave** — `src/components/player/SiriWave.tsx` is adapted from “Siri Wave” by 40973894 on 21st.dev (<https://21st.dev/@40973894/components/siri-wave>), MIT License. The original GLSL wave equations are preserved; Hermes adds playback-state time control, a muted tint, transparency and an output-level uniform.
- **Efferd UI** — the scroll-aware floating header pattern in `src/hooks/useScroll.ts` and the progressive blur in `src/components/ui/ProgressiveBlur.tsx` are adapted from Efferd UI (<https://github.com/sshahaider/efferd-ui>), MIT License, Copyright (c) 2025 sshahaider. Both patterns are also published in the Efferd library on 21st.dev.
- **shadcn/ui and dark.design** — the taskbar follows their floating-dock, tooltip and spacing conventions. No shadcn package, registry asset or dark.design asset is included.

## Fonts

Inter, Inter Tight and Instrument Serif are distributed under the SIL Open Font License 1.1. The WOFF2 files are self-hosted in `public/fonts/`.

## Services and content

- **Spotify** — search, library, playback and playlist data come from the Spotify Web API and the Spotify Web Playback SDK. Spotify remains the playback provider. Users must supply their own Spotify Developer app credentials. Spotify's terms and brand guidelines apply to its data, artwork and service.
- **LRCLIB** — timed and plain lyrics are requested from the public LRCLIB API (<https://lrclib.net>). lyrics.ovh is used as a plain-text fallback. Lyrics remain the property of their respective rights holders.
- **Artwork** — bundled artwork in `public/artwork/` was created for this repository. Album and artist images loaded at runtime come from Spotify's image CDN. No commercial audio is included.

## Runtime and libraries

The app uses Next.js, React, Zustand, Zod, Tailwind CSS, lucide-react, clsx and tailwind-merge under their respective open-source licenses. The packaged Windows build bundles a castLabs Electron for Content Security runtime (Electron/Chromium and their third-party licenses) plus the Widevine CDM, which is proprietary to Google. No Node.js installation is required for the packaged build.
