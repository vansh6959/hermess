import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: {
    default: "Hermes — music in glass",
    template: "%s · Hermes",
  },
  description:
    "A dark, liminal liquid-glass music player for your Spotify library, playlists, and synced lyrics.",
  applicationName: "Hermes",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var h=location.hostname;if(h==="localhost"||h==="[::1]"){var u=new URL(location.href);u.hostname="127.0.0.1";location.replace(u.toString());}}catch(e){}})();',
          }}
        />
        <link rel="preconnect" href="https://sdk.scdn.co" />
        <link
          rel="preconnect"
          href="https://api.spotify.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/inter-variable-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/inter-tight-variable-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/instrument-serif-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
