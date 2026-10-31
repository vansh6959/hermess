import { expect, test } from "@playwright/test";

const FIXTURE = {
  provider: "spotify",
  query: "test",
  fetchedAt: "2026-10-25T00:00:00.000Z",
  tracks: [
    {
      id: "sp-track-1",
      name: "Test Track",
      artists: "Test Artist",
      albumName: "Test Album",
      imageUrl: "/artwork/glass-hours.png",
      durationMs: 201000,
      explicit: false,
      spotifyUrl: "https://open.spotify.com/track/sp-track-1",
    },
    {
      id: "sp-track-2",
      name: "Another Song",
      artists: "Another Artist",
      albumName: "Test Album",
      imageUrl: "/artwork/glass-hours.png",
      durationMs: 182000,
      explicit: false,
      spotifyUrl: "https://open.spotify.com/track/sp-track-2",
    },
    {
      id: "sp-track-4",
      name: "Queued Song",
      artists: "Queued Artist",
      albumName: "Other Album",
      imageUrl: "/artwork/paper-moons.png",
      durationMs: 175000,
      explicit: false,
      spotifyUrl: "https://open.spotify.com/track/sp-track-4",
    },
  ],
  albums: [
    {
      id: "sp-album-1",
      name: "Test Album",
      artists: "Test Artist",
      imageUrl: "/artwork/glass-hours.png",
      releaseYear: "2024",
      totalTracks: 3,
      spotifyUrl: "https://open.spotify.com/album/sp-album-1",
    },
  ],
  artists: [],
};

const TEST_ALBUM = {
  id: "sp-album-1",
  name: "Test Album",
  artists: "Test Artist",
  imageUrl: "/artwork/glass-hours.png",
  releaseYear: "2024",
  totalTracks: 3,
  spotifyUrl: "https://open.spotify.com/album/sp-album-1",
};

const TEST_ALBUM_TRACKS = [
  {
    id: "sp-track-1",
    name: "Test Track",
    artists: "Test Artist",
    albumName: "Test Album",
    imageUrl: "/artwork/glass-hours.png",
    durationMs: 201000,
    explicit: false,
    spotifyUrl: "https://open.spotify.com/track/sp-track-1",
  },
  {
    id: "sp-track-2",
    name: "Another Song",
    artists: "Another Artist",
    albumName: "Test Album",
    imageUrl: "/artwork/glass-hours.png",
    durationMs: 182000,
    explicit: false,
    spotifyUrl: "https://open.spotify.com/track/sp-track-2",
  },
  {
    id: "sp-track-3",
    name: "Third Song",
    artists: "Third Artist",
    albumName: "Test Album",
    imageUrl: "/artwork/glass-hours.png",
    durationMs: 190000,
    explicit: false,
    spotifyUrl: "https://open.spotify.com/track/sp-track-3",
  },
];

const TEST_SYNCED_LYRICS = [
  "[00:01.00] First test lyric line",
  "[00:04.00] Second test lyric line",
  "[00:07.00] Third test lyric line",
].join("\n");

const TEST_LONG_LYRICS = Array.from({ length: 48 }, (_, index) => {
  const totalSeconds = index * 3 + 1;
  const stamp = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(
    totalSeconds % 60,
  ).padStart(2, "0")}.00`;
  return `[${stamp}] Lyric line ${index + 1}`;
}).join("\n");

const FAKE_SDK = `(() => {
  const TRACKS = {
    "sp-track-1": { name: "Test Track", artists: [{ name: "Test Artist" }], album: { name: "Test Album", images: [{ url: "/artwork/glass-hours.png" }] }, duration: 201000 },
    "sp-track-2": { name: "Another Song", artists: [{ name: "Another Artist" }], album: { name: "Test Album", images: [{ url: "/artwork/glass-hours.png" }] }, duration: 182000 },
    "sp-track-3": { name: "Third Song", artists: [{ name: "Third Artist" }], album: { name: "Test Album", images: [{ url: "/artwork/glass-hours.png" }] }, duration: 190000 },
    "sp-track-4": { name: "Queued Song", artists: [{ name: "Queued Artist" }], album: { name: "Other Album", images: [{ url: "/artwork/paper-moons.png" }] }, duration: 175000 },
    "lib-track-1": { name: "First Song", artists: [{ name: "Mira Vale" }], album: { name: "Lib Set", images: [] }, duration: 180000 },
    "lib-track-2": { name: "Second Song", artists: [{ name: "Mira Vale" }], album: { name: "Lib Set", images: [] }, duration: 181000 },
    "sp-track-short": { name: "Short Song", artists: [{ name: "Short Artist" }], album: { name: "Short Album", images: [{ url: "/artwork/paper-moons.png" }] }, duration: 31000 }
  };
  const trackFromUri = (uri) => {
    const id = (uri || "").split(":").pop();
    const known = TRACKS[id] || {
      name: id || "Unknown",
      artists: [],
      album: { name: "", images: [] },
      duration: 180000
    };
    return {
      id: id,
      uri: uri || ("spotify:track:" + id),
      name: known.name,
      artists: known.artists,
      album: known.album
    };
  };
  class FakePlayer {
    constructor(options) {
      this.options = options;
      this.listeners = {};
      this.current = trackFromUri("spotify:track:sp-track-1");
      this.position = 12000;
      this.duration = 201000;
      this.manual = [];
      this.context = [];
      this.previous = [];
      window.__hermesFakePlayer = this;
    }
    addListener(event, callback) {
      (this.listeners[event] = this.listeners[event] || []).push(callback);
      return true;
    }
    emit(event, payload) {
      (this.listeners[event] || []).forEach((callback) => callback(payload));
    }
    connect() {
      setTimeout(() => this.emit("ready", { device_id: "test-device" }), 10);
      return Promise.resolve(true);
    }
    disconnect() {}
    state() {
      const upcoming = [...this.manual, ...this.context];
      const limit = Number(window.__hermesFakeNextWindow);
      return {
        paused: false,
        position: this.position,
        duration: this.duration,
        track_window: {
          current_track: this.current,
          previous_tracks: this.previous,
          next_tracks: Number.isFinite(limit) ? upcoming.slice(0, limit) : upcoming
        }
      };
    }
    getCurrentState() {
      return Promise.resolve(this.state());
    }
    playUris(uris, offset, positionMs) {
      if (!Array.isArray(uris) || uris.length === 0) return;
      const position = Math.max(0, Math.min(Number(offset) || 0, uris.length - 1));
      const tracks = uris.map(trackFromUri);
      this.previous = tracks.slice(0, position);
      this.current = tracks[position];
      this.context = tracks.slice(position + 1);
      this.manual = [];
      this.position = Number.isFinite(Number(positionMs)) ? Number(positionMs) : 0;
      this.duration = (TRACKS[this.current.id] || {}).duration || 180000;
    }
    enqueue(uri) {
      this.manual.push(trackFromUri(uri));
    }
    togglePlay() { return Promise.resolve(); }
    pause() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    nextTrack() {
      const next = this.manual.length > 0 ? this.manual.shift() : this.context.shift();
      if (!next) return Promise.resolve();
      this.previous.push(this.current);
      this.current = next;
      this.position = 0;
      this.duration = (TRACKS[this.current.id] || {}).duration || 180000;
      this.emit("player_state_changed", this.state());
      return Promise.resolve();
    }
    previousTrack() {
      const previous = this.previous.pop();
      if (!previous) return Promise.resolve();
      this.context.unshift(this.current);
      this.current = previous;
      this.position = 0;
      this.duration = (TRACKS[this.current.id] || {}).duration || 180000;
      this.emit("player_state_changed", this.state());
      return Promise.resolve();
    }
    seek(position) {
      this.position = position;
      return Promise.resolve();
    }
    setVolume() { return Promise.resolve(); }
  }
  window.Spotify = { Player: FakePlayer };
  if (window.onSpotifyWebPlaybackSDKReady) {
    window.onSpotifyWebPlaybackSDKReady();
  }
})();
`;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

async function waitForFakePlayer(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { __hermesFakePlayer?: unknown })
        .__hermesFakePlayer,
    ),
  );
}

async function stubDesktopBridge(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    window.hermesDesktop = {
      isDesktop: true,
      openFloating: () => undefined,
      closeFloating: () => window.close(),
      focusMain: () => undefined,
    };
  });
}

async function mockSpotify(
  page: import("@playwright/test").Page,
  options: { connected: boolean; premium: boolean },
) {  let playCalled = false;
  let sdkRequested = false;
  let tokenRequested = false;
  let lastPlayBody: string | null = null;
  let lastQueueUrl: string | null = null;
  const queuedUris: string[] = [];

  await page.route("**/api/spotify/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connected: options.connected,
        profile: options.connected
          ? {
              id: "test-user",
              displayName: "Premium Listener",
              imageUrl: null,
              product: options.premium ? "premium" : "free",
              premium: options.premium,
            }
          : null,
      }),
    }),
  );

  await page.route("**/api/spotify/token**", (route) => {
    tokenRequested = true;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "test-access-token",
        expiresAt: Date.now() + 60 * 60 * 1000,
      }),
    });
  });

  await page.route("https://sdk.scdn.co/spotify-player.js", (route) => {
    sdkRequested = true;
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: FAKE_SDK,
    });
  });

  await page.route("https://api.spotify.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    if (request.url().includes("/me/player/play")) {
      playCalled = true;
      lastPlayBody = request.postData();
      try {
        const body = request.postDataJSON() as {
          uris?: string[];
          offset?: { position?: number };
          position_ms?: number;
        };
        if (body?.uris?.length) {
          await page.evaluate(
            ({ uris, position, positionMs }) => {
              (
                window as unknown as {
                  __hermesFakePlayer?: {
                    playUris: (
                      uris: string[],
                      position: number,
                      positionMs?: number,
                    ) => void;
                  };
                }
              ).__hermesFakePlayer?.playUris(uris, position, positionMs);
            },
            {
              uris: body.uris,
              position: body.offset?.position ?? 0,
              positionMs: body.position_ms,
            },
          );
        }
      } catch {
        // Requests without a JSON body do not change the fake queue.
      }
    }
    if (request.url().includes("/me/player/queue")) {
      lastQueueUrl = request.url();
      if (request.method() === "POST") {
        const uri = new URL(request.url()).searchParams.get("uri");
        if (uri) {
          queuedUris.push(uri);
          await page.evaluate((value) => {
            (
              window as unknown as {
                __hermesFakePlayer?: {
                  enqueue: (uri: string) => void;
                };
              }
            ).__hermesFakePlayer?.enqueue(value);
          }, uri);
        }
      }
    }
    await route.fulfill({ status: 204, headers: CORS_HEADERS });
  });

  await page.route("**/api/spotify/search**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FIXTURE),
    }),
  );

  await page.route("**/api/spotify/album**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        album: TEST_ALBUM,
        tracks: TEST_ALBUM_TRACKS,
      }),
    }),
  );

  await page.route("**/api/lyrics**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        found: true,
        syncedLyrics: TEST_SYNCED_LYRICS,
        plainLyrics: TEST_SYNCED_LYRICS.replace(
          /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
          "",
        ),
        instrumental: false,
      }),
    }),
  );

  return {
    wasPlayCalled: () => playCalled,
    wasSdkRequested: () => sdkRequested,
    wasTokenRequested: () => tokenRequested,
    lastPlayBody: () => lastPlayBody,
    lastQueueUrl: () => lastQueueUrl,
    queuedUris: () => queuedUris,
  };
}

test.describe("Spotify in-app playback", () => {
  test("adds a song to an existing playlist and can create a new one", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/spotify/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          connected: true,
          profile: {
            id: "test-user",
            displayName: "Premium Listener",
            imageUrl: null,
            product: "premium",
            premium: true,
          },
          scopes: ["streaming", "playlist-modify-private"],
          canModifyPlaylists: true,
        }),
      }),
    );
    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/spotify/playlists**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            playlists: [
              {
                id: "playlist-1",
                name: "Road Trip",
                description: null,
                imageUrl: null,
                trackCount: 12,
                ownerName: "Premium Listener",
                collaborative: false,
                url: "https://open.spotify.com/playlist/playlist-1",
              },
            ],
          }),
        });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      bodies.push(body);
      if (body.action === "add") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ added: true, playlistId: "playlist-1" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          added: true,
          playlist: {
            id: "playlist-2",
            name: body.name,
            description: body.description ?? null,
            imageUrl: null,
            trackCount: 1,
            ownerName: "Premium Listener",
            collaborative: false,
            url: "https://open.spotify.com/playlist/playlist-2",
          },
        }),
      });
    });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Add Test Track by Test Artist to playlist",
      })
      .click();
    const dialog = page.getByRole("dialog", { name: /Add.*Test Track.*playlist/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Road Trip/ }).click();
    await expect(page.getByText(/Added.*Test Track.*Road Trip/)).toBeVisible();
    expect(bodies[0]).toMatchObject({
      action: "add",
      playlistId: "playlist-1",
      trackId: "sp-track-1",
    });

    await page
      .getByRole("button", {
        name: "Add Test Track by Test Artist to playlist",
      })
      .click();
    await dialog.getByRole("button", { name: "New playlist" }).click();
    await dialog.getByLabel("Playlist name").fill("New Mix");
    await dialog.getByRole("button", { name: "Create and add" }).click();
    await expect(page.getByText(/Created.*New Mix/)).toBeVisible();
    expect(bodies[1]).toMatchObject({
      action: "create",
      name: "New Mix",
      trackId: "sp-track-1",
    });
  });

  test("prewarms the player and token before the first play", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await expect
      .poll(() => calls.wasSdkRequested(), { timeout: 10_000 })
      .toBe(true);
    await expect
      .poll(() => calls.wasTokenRequested(), { timeout: 10_000 })
      .toBe(true);
    await expect(page.getByTestId("spotify-player-bar")).toHaveCount(0);
  });

  test("shows the player immediately while the SDK is still connecting", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, {
      connected: true,
      premium: true,
    });
    await page.route("https://sdk.scdn.co/spotify-player.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: FAKE_SDK.replace(
          'setTimeout(() => this.emit("ready", { device_id: "test-device" }), 10);',
          'setTimeout(() => { window.__hermesFakeReady = true; this.emit("ready", { device_id: "test-device" }); }, 1500);',
        ),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    const play = page.getByRole("button", {
      name: "Play Test Track by Test Artist in Hermes",
    });
    await expect(play).toBeVisible();

    await play.click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible({
      timeout: 2_000,
    });
    const sdkReadyWhenBarAppeared = await page.evaluate(
      () =>
        Boolean(
          (window as unknown as { __hermesFakeReady?: boolean })
            .__hermesFakeReady,
        ),
    );
    expect(sdkReadyWhenBarAppeared).toBe(false);
    await expect
      .poll(() => calls.wasPlayCalled(), { timeout: 6_000 })
      .toBe(true);
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("keeps a prewarm failure quiet until playback is requested", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("https://sdk.scdn.co/spotify-player.js", (route) =>
      route.abort(),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page.waitForTimeout(700);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Playback unavailable");
  });

  test("plays a search result inside Hermes instead of navigating away", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    const sessionResponse = page.waitForResponse("**/api/spotify/session");
    await page.goto("/search");
    await sessionResponse;
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");

    const playButton = page.getByRole("button", {
      name: "Play Test Track by Test Artist in Hermes",
    });
    await expect(playButton).toBeVisible();
    await playButton.click();

    const playerBar = page.getByTestId("spotify-player-bar");
    await expect(playerBar).toBeVisible();
    await expect(playerBar).toContainText("Test Track");
    await expect(playerBar).toContainText("Test Artist");
    expect(calls.wasSdkRequested()).toBe(true);
    await expect(
      page.getByRole("button", { name: "Pause" }),
    ).toBeVisible();
    await expect.poll(calls.wasPlayCalled).toBe(true);
    expect(new URL(page.url()).pathname).toBe("/search");
    await expect(page.getByRole("region", { name: "Player", exact: true })).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Test Track" })).toBeVisible();
  });

  test("records playback in listening stats", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            getCurrentState: () => Promise<
              Record<string, unknown> & { position: number }
            >;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      let position = 12_000;
      fake.getCurrentState = async () => {
        const state = await original();
        position += 1_000;
        return { ...state, position };
      };
    });

    await page.waitForTimeout(3_200);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Stats", exact: true })
      .click();

    await expect(
      page.getByRole("heading", { name: "Your Stats" }),
    ).toBeVisible();
    const tracks = page.getByRole("region", { name: "Top tracks" });
    const first = tracks.locator("ol > li").first();
    await expect(first).toContainText("Test Track");
    await expect(first).toContainText("1 play");
    await expect(first.getByText(/[1-9]\d*s/)).toBeVisible();

    const stats = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hermes.spotify.stats.v1") ?? "null"),
    );
    expect(stats.tracks["sp-track-1"].plays).toBe(1);
  });

  test("records a scrobble at the dynamic eligibility threshold", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/spotify/search**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: "spotify",
          query: "short",
          fetchedAt: new Date().toISOString(),
          tracks: [
            {
              id: "sp-track-short",
              name: "Short Song",
              artists: "Short Artist",
              albumName: "Short Album",
              imageUrl: "/artwork/paper-moons.png",
              durationMs: 31_000,
              explicit: false,
              spotifyUrl: "https://open.spotify.com/track/sp-track-short",
            },
          ],
          albums: [],
          artists: [],
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("short");
    const startedAt = Math.floor(Date.now() / 1_000);
    await page
      .getByRole("button", {
        name: "Play Short Song by Short Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            position: number;
            getCurrentState: () => Promise<
              Record<string, unknown> & { position: number }
            >;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      const started = performance.now();
      const base = fake.position;
      fake.getCurrentState = async () => ({
        ...(await original()),
        position: base + (performance.now() - started),
      });
    });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = localStorage.getItem("hermes.scrobbles.v1");
            if (!raw) return 0;
            const parsed = JSON.parse(raw) as { scrobbles?: unknown };
            return Array.isArray(parsed.scrobbles)
              ? parsed.scrobbles.length
              : 0;
          }),
        { timeout: 25_000 },
      )
      .toBeGreaterThan(0);

    const scrobble = await page.evaluate(() => {
      const raw = localStorage.getItem("hermes.scrobbles.v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        scrobbles?: Array<Record<string, unknown>>;
      };
      return parsed.scrobbles?.[0] ?? null;
    });
    expect(scrobble).toMatchObject({
      artist: "Short Artist",
      track: "Short Song",
      album: "Short Album",
      duration: 31,
    });
    expect(
      Math.abs(Number(scrobble?.timestamp) - startedAt),
    ).toBeLessThanOrEqual(3);
    expect(Math.floor(Date.now() / 1_000) - startedAt).toBeLessThan(25);
  });

  test("shows account stats without a local ledger", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });
    const now = Date.now();
    await page.route("**/api/spotify/stats", (route) =>
      route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
        body: JSON.stringify({
          connected: true,
          stats: {
            version: 1,
            startedAt: now - 86_400_000,
            updatedAt: now,
            totalListenedMs: 7_200_000,
            tracks: {
              "account-track-1": {
                id: "account-track-1",
                name: "Account Track",
                artists: "Account Artist",
                albumName: "Account Album",
                imageUrl: null,
                spotifyUrl:
                  "https://open.spotify.com/track/account-track-1",
                plays: 12,
                listenedMs: 7_200_000,
                lastPlayedAt: now,
              },
            },
          },
        }),
      }),
    );

    await page.goto("/stats");
    await expect(
      page.getByRole("heading", { name: "Your Stats" }),
    ).toBeVisible();
    await expect(
      page.getByText("2h", { exact: true }).first(),
    ).toBeVisible();
    const tracks = page.getByRole("region", { name: "Top tracks" });
    await expect(tracks.locator("ol > li").first()).toContainText(
      "Account Track",
    );
    await expect(page.getByText("ON THIS DEVICE")).toHaveCount(0);
  });

  test("shows the live player in the Library side panel", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library", exact: true })
      .click();

    const right = page.getByTestId("library-right");
    await expect(right.getByText("Test Track", { exact: true }).first()).toBeVisible();
    await expect(right.getByText("Test Artist", { exact: true }).first()).toBeVisible();
    await expect(right.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(
      right.getByRole("button", { name: "Previous track" }),
    ).toBeVisible();
    await expect(
      right.getByRole("button", { name: "Next track" }),
    ).toBeVisible();
  });

  test("plays only the chosen search result without inventing a queue", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");

    const playButton = page.getByRole("button", {
      name: "Play Test Track by Test Artist in Hermes",
    });
    await expect(playButton).toBeVisible();

    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await playButton.click();

    const body = (await playRequest).postDataJSON() as {
      uris?: string[];
      offset?: unknown;
    };
    expect(body.uris).toEqual(["spotify:track:sp-track-1"]);
    expect(body.offset).toBeUndefined();
    await expect.poll(calls.wasPlayCalled).toBe(true);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Test Track" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Queue" })).toHaveCount(0);
  });

  test("starts albums as an explicit queue and puts manual songs next", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, {
      connected: true,
      premium: true,
    });
    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");

    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") &&
        request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();

    const body = (await playRequest).postDataJSON() as {
      uris?: string[];
      context_uri?: string;
    };
    expect(body.uris).toEqual([
      "spotify:track:sp-track-1",
      "spotify:track:sp-track-2",
      "spotify:track:sp-track-3",
    ]);
    expect(body.context_uri).toBeUndefined();

    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    const addQueued = page.getByRole("button", {
      name: "Add Queued Song by Queued Artist to queue",
    });
    await expect(addQueued).toBeVisible();
    await addQueued.click();
    await expect.poll(calls.lastQueueUrl).not.toBeNull();
    expect(new URL(calls.lastQueueUrl()!).searchParams.get("uri")).toBe(
      "spotify:track:sp-track-4",
    );

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Show queue" }).click();
    const queue = full.getByRole("region", { name: "Queue" });
    await expect
      .poll(() =>
        queue
          .locator('button[aria-label^="Play "]')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
      )
      .toEqual([
        "Play Queued Song",
        "Play Another Song",
        "Play Third Song",
      ]);
  });

  test("continues the playlist after the manual queue empties", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Show queue" }).click();
    const queue = full.getByRole("region", { name: "Queue" });
    const upcomingLabels = () =>
      queue
        .locator('button[aria-label^="Play "]')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-label")),
        );

    await expect(queue).toContainText("Next in queue");
    await expect(queue).toContainText("Next from: Test Album");
    await expect.poll(upcomingLabels).toEqual([
      "Play Queued Song",
      "Play Another Song",
      "Play Third Song",
    ]);

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Queued Song" }),
    ).toBeVisible();
    await expect(queue).not.toContainText("Next in queue");
    await expect(queue).toContainText("Next from: Test Album");
    await expect.poll(upcomingLabels).toEqual([
      "Play Another Song",
      "Play Third Song",
    ]);

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await expect.poll(upcomingLabels).toEqual(["Play Third Song"]);
  });

  test("keeps every manually queued song visible when the SDK window is short", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __hermesFakeNextWindow?: number }
      ).__hermesFakeNextWindow = 1;
    });
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");

    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Play Test Track by Test Artist in Hermes" })
      .click();
    await playRequest;
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    await page
      .getByRole("button", { name: "Add Another Song by Another Artist to queue" })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);
    await page
      .getByRole("button", { name: "Add Queued Song by Queued Artist to queue" })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(2);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Show queue" }).click();
    const queue = full.getByRole("region", { name: "Queue" });
    await expect
      .poll(() =>
        queue
          .locator('button[aria-label^="Play "]')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
      )
      .toEqual(["Play Another Song", "Play Queued Song"]);
  });

  test("adds another search result to the queue while a track is playing", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");

    const addAnother = page.getByRole("button", {
      name: "Add Another Song by Another Artist to queue",
    });
    await expect(addAnother).toHaveCount(0);

    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await expect(addAnother).toBeVisible();

    await addAnother.click();

    await expect.poll(() => calls.lastQueueUrl()).not.toBeNull();
    const queueUrl = new URL(calls.lastQueueUrl()!);
    expect(queueUrl.searchParams.get("uri")).toBe("spotify:track:sp-track-2");
    expect(queueUrl.searchParams.get("device_id")).toBe("test-device");
    await expect(
      page.getByText(/Added .*Another Song.* to queue/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open search" }).click();
    const palette = page.getByRole("dialog", { name: "Search Hermes" });
    await palette.getByRole("combobox").fill("test");
    await expect(
      palette.getByRole("button", { name: "Add Another Song to queue" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Show queue" }).click();
    await expect(full.getByRole("region", { name: "Queue" })).toContainText(
      "Another Song",
    );
  });

  test("starts a library playlist with Spotify's native shuffle", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const tracks = ["First Song", "Second Song"].map((name, index) => ({
        id: `lib-track-${index + 1}`,
        source: "spotify",
        name,
        artists: "Mira Vale",
        albumName: "Lib Set",
        imageUrl: null,
        durationMs: 180000 + index * 1000,
        url: `https://open.spotify.com/track/lib-track-${index + 1}`,
      }));
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists: [
              {
                id: "lib-set",
                source: "spotify",
                name: "Lib Set",
                description: null,
                imageUrl: null,
                trackCount: tracks.length,
                tracks,
                url: null,
                importedAt: Date.now(),
              },
            ],
            likedSongs: [],
            lastImportedAt: Date.now(),
          },
          version: 1,
        }),
      );
    });

    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/library");
    await page.getByRole("button", { name: "Lib Set", exact: true }).click();
    const panel = page.getByRole("region", { name: "Lib Set" });
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Play First Song" }).click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await panel.getByRole("button", { name: "Add Second Song to queue" }).click();
    await expect.poll(() => calls.lastQueueUrl()).not.toBeNull();

    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") &&
        request.method() === "PUT" &&
        (request.postData() ?? "").includes("lib-track-2"),
    );
    const shuffleRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=true"),
    );
    await panel.getByRole("button", { name: "Shuffle Lib Set" }).click();

    const body = (await playRequest).postDataJSON() as {
      uris?: string[];
      offset?: { position?: number };
    };
    expect(body.uris).toEqual([
      "spotify:track:lib-track-1",
      "spotify:track:lib-track-2",
    ]);
    expect(body.offset).toEqual({ position: 0 });
    const shuffleUrl = new URL((await shuffleRequest).url());
    expect(shuffleUrl.searchParams.get("device_id")).toBe("test-device");

    await expect(page.getByTestId("spotify-player-bar")).toContainText(
      "First Song",
    );
    await expect(
      panel
        .getByRole("button", { name: "Play First Song" })
        .getByTestId("audio-pulse"),
    ).toBeVisible();
    await expect(
      panel
        .getByRole("button", { name: "Play Second Song" })
        .getByTestId("audio-pulse"),
    ).toHaveCount(0);
  });
  test("toggles Spotify's native shuffle without replaying playback", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(
      full.locator("header").getByRole("button", { name: "Turn shuffle on" }),
    ).toBeVisible();
    await expect(
      full.locator(".np-transport").getByRole("button", { name: /shuffle/i }),
    ).toHaveCount(0);

    let replayCount = 0;
    page.on("request", (request) => {
      if (request.url().includes("/me/player/play")) replayCount += 1;
    });

    const shuffleOn = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=true"),
    );
    await full.getByRole("button", { name: "Turn shuffle on" }).click();
    const shuffleOnUrl = new URL((await shuffleOn).url());
    expect(shuffleOnUrl.searchParams.get("device_id")).toBe("test-device");
    await expect(
      full.getByRole("button", { name: "Turn shuffle off" }),
    ).toHaveAttribute("aria-pressed", "true");

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();

    const shuffleOff = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=false"),
    );
    await full.getByRole("button", { name: "Turn shuffle off" }).click();
    await shuffleOff;
    await expect(
      full.getByRole("button", { name: "Turn shuffle on" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(replayCount).toBe(0);
  });
  test("disables shuffle for a single-track context", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(
      full.getByRole("button", { name: "Turn shuffle on" }),
    ).toBeDisabled();
  });

  test("keeps Spotify shuffle on when a new context starts", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    const playAlbum = page.getByRole("button", {
      name: "Play Test Album by Test Artist in Hermes",
    });
    await playAlbum.click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    const enableShuffle = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=true"),
    );
    await full.getByRole("button", { name: "Turn shuffle on" }).click();
    await enableShuffle;
    await expect(
      full.getByRole("button", { name: "Turn shuffle off" }),
    ).toBeVisible();

    await full
      .getByRole("button", { name: "Dock player" })
      .click();
    const restartPlay = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") &&
        request.method() === "PUT",
    );
    const reShuffle = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=true"),
    );
    await playAlbum.click();
    const body = (await restartPlay).postDataJSON() as { uris?: string[] };
    expect(body.uris).toEqual([
      "spotify:track:sp-track-1",
      "spotify:track:sp-track-2",
      "spotify:track:sp-track-3",
    ]);
    await reShuffle;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    await expect(
      page
        .getByTestId("spotify-full-player")
        .getByRole("button", { name: "Turn shuffle off" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("mirrors shuffle enabled from another Spotify client", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("https://api.spotify.com/v1/me/player", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ shuffle_state: true, is_playing: true }),
      });
    });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(
      full.getByRole("button", { name: "Turn shuffle off" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 8_000 });
  });

  test("keeps the confirmed mode when Spotify shuffle fails", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await page.route("**/me/player/shuffle**", (route) =>
      route.fulfill({
        status: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { status: 500 } }),
      }),
    );
    await full.getByRole("button", { name: "Turn shuffle on" }).click();

    await expect(page.getByText("Could not change shuffle.")).toBeVisible();
    const shuffleOn = full.getByRole("button", { name: "Turn shuffle on" });
    await expect(shuffleOn).toBeEnabled();
    await expect(shuffleOn).toHaveAttribute("aria-pressed", "false");

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
  });
  test("next plays the track shown as up next", async ({ page }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await expect
      .poll(() => calls.wasPlayCalled(), { timeout: 5_000 })
      .toBe(true);

    const addAnother = page.getByRole("button", {
      name: "Add Another Song by Another Artist to queue",
    });
    await expect(addAnother).toBeVisible();
    await addAnother.click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);

    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(2);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library", exact: true })
      .click();

    const right = page.getByTestId("library-right");
    await expect(
      right.getByText("Test Track", { exact: true }).first(),
    ).toBeVisible();
    await right.getByRole("button", { name: /^Queue/ }).click();

    const rows = right.locator("ul > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Another Song");
    await expect(rows.nth(1)).toContainText("Queued Song");
    await expect(rows.nth(0)).toContainText("Next");

    await right.getByRole("button", { name: "Next track" }).click();

    await expect(
      right.getByText("Another Song", { exact: true }).first(),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Queued Song");
    await expect(rows.nth(0)).toContainText("Next");
  });

  test("restarts the current song before walking back", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      (
        window as unknown as { __hermesFakePlayer?: { position: number } }
      ).__hermesFakePlayer!.position = 12_000;
    });
    await page.waitForTimeout(1_200);
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await expect(full.getByRole("heading", { name: "Test Track" })).toHaveCount(
      0,
    );

    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();
  });

  test("walks back instantly without a new play request", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();

    let playedAgain = false;
    page.on("request", (request) => {
      if (request.url().includes("/me/player/play")) playedAgain = true;
    });
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    expect(playedAgain).toBe(false);
  });

  test("walks the confirmed history back and forward without duplicates", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    const heading = (name: string) => full.getByRole("heading", { name });

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(heading("Another Song")).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(heading("Third Song")).toBeVisible();

    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(heading("Another Song")).toBeVisible();
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(heading("Test Track")).toBeVisible();

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(heading("Another Song")).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(heading("Third Song")).toBeVisible();
  });

  test("previous ignores a device history entry that points elsewhere", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, {
      connected: true,
      premium: true,
    });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const player = (
        window as unknown as {
          __hermesFakePlayer?: {
            previous: unknown[];
            position: number;
          };
        }
      ).__hermesFakePlayer;
      if (!player) return;
      player.position = 0;
      player.previous = [
        {
          id: "sp-track-4",
          uri: "spotify:track:sp-track-4",
          name: "Queued Song",
          artists: [{ name: "Queued Artist" }],
          album: { name: "Other Album", images: [] },
        },
      ];
    });

    const fallback = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await full.getByRole("button", { name: "Previous track" }).click();
    const body = (await fallback).postDataJSON() as { uris?: string[] };
    expect(body.uris?.[0]).toBe("spotify:track:sp-track-2");
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toHaveCount(0);

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
    expect(calls.queuedUris()).toHaveLength(0);
  });

  test("rapid Next presses advance playback exactly once", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const player = (
        window as unknown as {
          __hermesFakePlayer?: {
            nextTrack?: () => Promise<void>;
          };
        }
      ).__hermesFakePlayer;
      if (!player?.nextTrack) return;
      const original = player.nextTrack.bind(player);
      player.nextTrack = () =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            original();
            resolve();
          }, 700);
        });
    });

    const next = full.getByRole("button", { name: "Next track" });
    await next.click();
    await next.click();

    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toHaveCount(0);

    await page.waitForTimeout(150);
    await next.click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("duplicate SDK events do not advance playback twice", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const player = (
        window as unknown as {
          __hermesFakePlayer?: {
            state: () => unknown;
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__hermesFakePlayer;
      if (!player) return;
      for (let index = 0; index < 3; index += 1) {
        player.emit("player_state_changed", player.state());
      }
    });

    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
  });

  test("synchronizes a track changed outside Hermes into history", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const player = (
        window as unknown as {
          __hermesFakePlayer?: {
            current: unknown;
            position: number;
            state: () => unknown;
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__hermesFakePlayer;
      if (!player) return;
      player.current = {
        id: "sp-track-2",
        uri: "spotify:track:sp-track-2",
        name: "Another Song",
        artists: [{ name: "Another Artist" }],
        album: {
          name: "Test Album",
          images: [{ url: "/artwork/glass-hours.png" }],
        },
      };
      player.position = 0;
      player.emit("player_state_changed", player.state());
    });

    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
  });

  test("previous with shuffle still returns the played previous track", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    const shuffleOn = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/shuffle") &&
        request.url().includes("state=true"),
    );
    await full.getByRole("button", { name: "Turn shuffle on" }).click();
    await shuffleOn;

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
  });

  test("a failed Previous correction keeps the confirmed track", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    const playRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/me/player/play") && request.method() === "PUT",
    );
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await playRequest;
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
    await waitForFakePlayer(page);

    await page.evaluate(() => {
      const player = (
        window as unknown as {
          __hermesFakePlayer?: { previous: unknown[]; position: number };
        }
      ).__hermesFakePlayer;
      if (!player) return;
      player.position = 0;
      player.previous = [
        {
          id: "sp-track-4",
          uri: "spotify:track:sp-track-4",
          name: "Queued Song",
          artists: [{ name: "Queued Artist" }],
          album: { name: "Other Album", images: [] },
        },
      ];
    });

    await page.route("**/me/player/play**", (route) =>
      route.fulfill({
        status: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: { status: 500 } }),
      }),
    );
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(page.getByText("Could not skip back.")).toBeVisible();
    await expect(
      full.getByRole("heading", { name: "Third Song" }),
    ).toBeVisible();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toHaveCount(0);

    await page.unroute("**/me/player/play**");
    // A failed skip is a non-blocking notice now; playback stays usable.
    await full.getByRole("button", { name: "Previous track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
  });

  test("walks a manually queued list with Next and Previous", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await expect
      .poll(() => calls.wasPlayCalled(), { timeout: 5_000 })
      .toBe(true);

    await page
      .getByRole("button", {
        name: "Add Another Song by Another Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);
    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(2);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library", exact: true })
      .click();
    const right = page.getByTestId("library-right");
    await right.getByRole("button", { name: /^Queue/ }).click();
    const rows = right.locator("ul > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Another Song");
    await expect(rows.nth(0)).toContainText("Next");

    await right.getByRole("button", { name: "Next track" }).click();
    await expect(
      right.getByText("Another Song", { exact: true }).first(),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Queued Song");

    await right.getByRole("button", { name: "Previous track" }).click();
    await expect(
      right.getByText("Test Track", { exact: true }).first(),
    ).toBeVisible();
    // Spotify keeps the manual queue ahead of the context after stepping
    // back: the remaining manual song still plays before the playlist.
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Queued Song");
    await expect(rows.nth(0)).toContainText("Next");
    await expect(rows.nth(1)).toContainText("Another Song");

    await right.getByRole("button", { name: "Next track" }).click();
    await expect(
      right.getByText("Queued Song", { exact: true }).first(),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Another Song");
    await right.getByRole("button", { name: "Next track" }).click();
    await expect(
      right.getByText("Another Song", { exact: true }).first(),
    ).toBeVisible();
    await expect(right.getByText("Nothing queued right now.")).toBeVisible();
  });

  test("accepts a skip that lands on a duplicate Spotify release", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            current: Record<string, unknown>;
            duration: number;
            position: number;
            paused: boolean;
            state: () => {
              duration: number;
              track_window: { next_tracks: Array<Record<string, unknown>> };
            };
            playUris: (uris: string[], offset: number, positionMs?: number) => void;
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");

      const canonical = {
        id: "sp-track-4-canonical",
        uri: "spotify:track:sp-track-4-canonical",
        name: "Queued Song",
        artists: [{ name: "Queued Artist" }],
        album: {
          name: "Other Album",
          images: [{ url: "/artwork/paper-moons.png" }],
        },
        duration: 175000,
      };
      const originalState = fake.state.bind(fake);
      fake.state = () => {
        const state = originalState();
        if (state.track_window.next_tracks.length > 0) {
          state.track_window.next_tracks = state.track_window.next_tracks.map(
            (track, index) =>
              index === 0
                ? { ...track, id: canonical.id, uri: canonical.uri }
                : track,
          );
        }
        return state;
      };
      fake.playUris = () => {
        window.setTimeout(() => {
          fake.current = canonical;
          fake.position = 0;
          fake.duration = canonical.duration;
          fake.paused = false;
          fake.emit("player_state_changed", fake.state());
        }, 2_000);
      };
    });

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library", exact: true })
      .click();
    const right = page.getByTestId("library-right");
    await right.getByRole("button", { name: /^Queue/ }).click();
    await right.getByRole("button", { name: "Next track" }).click();

    await expect(
      right.getByText("Queued Song", { exact: true }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Playback unavailable")).toHaveCount(0);
  });

  test("quick queue slides in on Home, adds a song, and closes outside", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();

    const homeTitle = page.getByRole("heading", {
      name: "Test Track",
      exact: true,
    });
    await expect(homeTitle).toBeVisible();

    const trigger = page.getByTestId("quick-queue-trigger");
    const panel = page.getByTestId("quick-queue-panel");
    await expect(trigger).toBeVisible();
    await expect(panel).toHaveAttribute("data-state", "closed");
    const motion = await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        property: style.transitionProperty,
        duration: style.transitionDuration,
      };
    });
    expect(motion.property).toContain("transform");
    expect(motion.duration).toContain("0.42s");

    await trigger.click();
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel.getByText("Nothing queued")).toBeVisible();
    await expect
      .poll(async () => {
        const [panelBox, triggerBox] = await Promise.all([
          panel.boundingBox(),
          trigger.boundingBox(),
        ]);
        if (!panelBox || !triggerBox) return -1;
        return Math.round(triggerBox.x - (panelBox.x + panelBox.width));
      })
      .toBeGreaterThan(4);
    await expect
      .poll(async () => {
        const [panelBox, triggerBox] = await Promise.all([
          panel.boundingBox(),
          trigger.boundingBox(),
        ]);
        if (!panelBox || !triggerBox) return 999;
        return Math.round(triggerBox.x - (panelBox.x + panelBox.width));
      })
      .toBeLessThan(30);

    await panel
      .getByRole("textbox", { name: "Search songs to add to the queue" })
      .fill("test");
    const addAnother = panel.getByRole("button", {
      name: "Add Another Song by Another Artist to queue",
    });
    await expect(addAnother).toBeVisible({ timeout: 10_000 });
    await addAnother.click();
    await expect
      .poll(() => calls.queuedUris())
      .toContain("spotify:track:sp-track-2");

    await panel
      .getByRole("button", { name: "Clear queue search" })
      .click();
    const rows = panel.getByTestId("quick-queue-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Another Song");
    await expect(rows.first()).toContainText("Next");

    await trigger.click();
    await expect(panel).toHaveAttribute("data-state", "closed");

    await trigger.click();
    await expect(panel).toHaveAttribute("data-state", "open");
    await homeTitle.click();
    await expect(panel).toHaveAttribute("data-state", "closed");
  });

  test("shows a queued song before Spotify confirms the add", async ({
    page,
  }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });
    let releaseQueue: () => void = () => {};
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await page.route(
      "https://api.spotify.com/v1/me/player/queue**",
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await queueGate;
        return route.fallback();
      },
    );

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();

    const panel = page.getByTestId("quick-queue-panel");
    await page.getByTestId("quick-queue-trigger").click();
    await panel
      .getByRole("textbox", { name: "Search songs to add to the queue" })
      .fill("test");
    const add = panel.getByRole("button", {
      name: "Add Another Song by Another Artist to queue",
    });
    await expect(add).toBeVisible({ timeout: 10_000 });
    await add.click();
    await panel.getByRole("button", { name: "Clear queue search" }).click();

    // The optimistic row is on screen while the POST is still blocked.
    await expect(panel.getByTestId("quick-queue-row")).toHaveCount(1, {
      timeout: 1_000,
    });
    expect(calls.queuedUris()).toHaveLength(0);

    releaseQueue();
    await expect.poll(() => calls.queuedUris().length).toBe(1);
    await expect(
      page.getByText(/Added .*Another Song.* to queue/),
    ).toBeVisible();
  });

  test("plays a queued song from the floating queue", async ({ page }) => {
    const calls = await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    await page
      .getByRole("button", {
        name: "Add Another Song by Another Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);
    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(2);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Test Track", exact: true }),
    ).toBeVisible();

    const trigger = page.getByTestId("quick-queue-trigger");
    const panel = page.getByTestId("quick-queue-panel");
    await trigger.click();
    const rows = panel.getByTestId("quick-queue-row");
    await expect(rows).toHaveCount(2);

    await panel.getByRole("button", { name: "Play Queued Song" }).click();
    await expect(
      page.getByRole("heading", { name: "Queued Song", exact: true }),
    ).toBeVisible();
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel.getByText("Nothing queued")).toBeVisible();
  });

  test("tints Home from the playing cover and uses the Siri wave transport", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search?perf=full");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();

    const bar = page.getByTestId("spotify-player-bar");
    await expect(bar).toBeVisible();
    const dockWave = bar.getByTestId("siri-wave");
    await expect(dockWave).toBeVisible();
    await expect(dockWave).toHaveAttribute("data-ready", "true");
    await expect(dockWave).toHaveAttribute("data-playing", "true");
    await expect(bar.getByTestId("siri-play")).toHaveAttribute(
      "data-size",
      "compact",
    );
    const dockGlyph = bar.getByTestId("siri-transport-glyph");
    await bar.getByTestId("siri-play").hover();
    await expect(dockGlyph).toHaveCSS("opacity", "1");
    await expect(dockWave).toHaveCSS("opacity", "0");
    await page.mouse.move(20, 900);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();

    const backdrop = page.getByTestId("home-cover-backdrop");
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveAttribute("data-playing", "true");
    const layer = backdrop.locator(".home-cover-backdrop__layer--a");
    const drift = await layer.evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    expect(drift).toContain("home-cover-drift-a");
    const driftBefore = await layer.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.waitForTimeout(600);
    const driftAfter = await layer.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    expect(driftAfter).not.toBe(driftBefore);
    const homePause = page.getByRole("button", {
      name: "Pause current track",
    });
    const homeWave = homePause.getByTestId("siri-wave");
    await expect(homeWave).toBeVisible();
    await expect(homeWave).toHaveAttribute("data-playing", "true");
    await expect(homePause).toHaveAttribute("data-size", "panel");
    const homeGlyph = homePause.getByTestId("siri-transport-glyph");
    await homePause.hover();
    await expect(homeGlyph).toHaveCSS("opacity", "1");
    await expect(homeWave).toHaveCSS("opacity", "0");
    await page.mouse.move(20, 900);

    const previous = page.getByRole("button", { name: "Previous track" });
    const next = page.getByRole("button", { name: "Next track" });
    await expect(previous).toBeVisible();
    await expect(next).toBeVisible();
    const [previousBox, pauseBox, nextBox] = await Promise.all([
      previous.boundingBox(),
      homePause.boundingBox(),
      next.boundingBox(),
    ]);
    expect(previousBox).not.toBeNull();
    expect(pauseBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(previousBox!.x + previousBox!.width).toBeLessThan(pauseBox!.x);
    expect(pauseBox!.x + pauseBox!.width).toBeLessThan(nextBox!.x);

    await page.goto("/library");
    await expect(backdrop).toHaveCount(0);
  });

  test("keeps the floating player across app tabs until it is closed", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Minimize player to a floating window" })
      .click();
    const floating = page.getByTestId("spotify-floating-player");
    await expect(floating).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    for (const [label, path] of [
      ["Library", "/library"],
      ["Stats", "/stats"],
      ["Settings", "/settings"],
      ["Home", "/"],
    ] as const) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === path);
      await expect(floating).toBeVisible();
      await expect(page.getByTestId("spotify-player-bar")).toHaveCount(0);
    }

    const homeNav = page.getByRole("navigation", { name: "Primary navigation" });
    await homeNav.getByRole("link", { name: "Library", exact: true }).click();
    await expect(page.getByTestId("library-left")).toBeVisible();
    await expect(floating).toBeVisible();

    await floating
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(full).toHaveCount(0);
    await expect(floating).toBeVisible();
    await expect(page.getByTestId("spotify-player-bar")).toHaveCount(0);
  });

  test("mirrors playback into the desktop floating route and controls it", async ({
    page,
    context,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Album by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    const float = await context.newPage();
    await stubDesktopBridge(float);
    await float.goto("/desktop-floating");
    const card = float.getByTestId("desktop-floating-player");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveAttribute("data-connected", "true");
    await expect(
      card.getByText("Test Track", { exact: true }).first(),
    ).toBeVisible();

    await card.getByRole("button", { name: "Next track" }).click();
    await expect(
      card.getByText("Another Song", { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await float.close();
  });

  test("waits for live playback instead of cached state", async ({
    page,
    context,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");

    const float = await context.newPage();
    await stubDesktopBridge(float);
    await float.goto("/desktop-floating");
    const card = float.getByTestId("desktop-floating-player");
    // No playback yet: the float is connected to Hermes but has no track.
    await expect(card).toHaveAttribute("data-connected", "true", {
      timeout: 10_000,
    });
    await expect(float.getByTestId("desktop-floating-waiting")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Next track" }),
    ).toHaveCount(0);

    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(
      card.getByText("Test Track", { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(float.getByTestId("desktop-floating-waiting")).toHaveCount(0);

    // Closing the main window stops the heartbeat. The float must stop
    // claiming playback instead of free-running on its last snapshot.
    await page.close();
    await expect(card).toHaveAttribute("data-connected", "false", {
      timeout: 10_000,
    });
    await expect(float.getByTestId("desktop-floating-waiting")).toBeVisible();

    await float.close();
  });

  test("shows a desktop-only message when opened outside the shell", async ({
    page,
  }) => {
    await page.goto("/desktop-floating");
    await expect(
      page.getByTestId("desktop-floating-requires-desktop"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("desktop-floating-player")).toHaveCount(0);
  });

  test("opens the native desktop float from minimize and docks the player", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    // Pretend the page is the Electron shell only after the SDK initialized;
    // the desktop DRM probe would otherwise reject this headless browser.
    await page.evaluate(() => {
      window.hermesDesktop = {
        isDesktop: true,
        openFloating: () => {
          (
            window as unknown as { __floatRequested?: number }
          ).__floatRequested =
            ((window as unknown as { __floatRequested?: number })
              .__floatRequested ?? 0) + 1;
        },
        closeFloating: () => undefined,
        focusMain: () => undefined,
      };
    });

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Minimize player to a floating window" })
      .click();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __floatRequested?: number })
              .__floatRequested ?? 0,
        ),
      )
      .toBe(1);
    await expect(page.getByTestId("spotify-floating-player")).toHaveCount(0);
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
  });

  test("keeps the browser floating player in-page without Document PiP", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search?perf=full");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Minimize player to a floating window" })
      .click();

    const floating = page.getByTestId("spotify-floating-player");
    await expect(floating).toBeVisible();
    await expect(
      floating.getByRole("button", { name: "Pop out always on top" }),
    ).toHaveCount(0);
  });

  test("expands to full screen and minimizes to a floating card without stopping playback", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();

    const bar = page.getByTestId("spotify-player-bar");
    await expect(bar).toBeVisible();

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();
    await expect(full.locator(".np-bg")).toHaveCount(0);
    const paletteColor = await full.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--np-a").trim(),
    );
    expect(paletteColor).toMatch(
      /^(#[0-9a-f]{6}|rgba?\(\d+, \d+, \d+(?:, [\d.]+)?\))$/i,
    );
    const atmosphere = full.getByTestId("np-atmosphere");
    await expect(atmosphere).toHaveAttribute("data-playing", "true");
    const backdrop = full.locator('.np-art[data-active="true"]');
    const backdropBefore = await backdrop.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.waitForTimeout(300);
    expect(
      await backdrop.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    ).not.toBe(backdropBefore);
    await expect(full).toContainText("Test Track");
    await expect(full).toContainText("Test Artist");
    await expect(full).toContainText("First test lyric line");
    await expect(full.getByText("Unsynced")).toHaveCount(0);
    await full.getByRole("button", { name: "Hide lyrics" }).click();
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toHaveCount(0);
    await full.getByRole("button", { name: "Show lyrics" }).click();
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toBeVisible();

    await full.getByRole("button", { name: "Show queue" }).click();
    await expect(full.getByRole("region", { name: "Queue" })).toBeVisible();
    await expect(full.getByText("Queue is empty")).toBeVisible();
    await full.getByRole("button", { name: "Show lyrics" }).click();
    await expect(full.getByRole("region", { name: "Queue" })).toHaveCount(0);
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toBeVisible();

    await full.getByRole("button", { name: "Show queue" }).click();
    await expect(full.getByRole("region", { name: "Queue" })).toBeVisible();
    await full.getByRole("button", { name: "Hide queue" }).click();
    await expect(full.getByRole("region", { name: "Lyrics" })).toBeVisible();
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toBeVisible();
    await expect(full.getByRole("region", { name: "Queue" })).toHaveCount(0);
    await expect(
      full.getByRole("button", { name: "Hide lyrics" }),
    ).toBeVisible();

    await full.getByRole("button", { name: "Mute" }).click();
    await expect(full.getByRole("button", { name: "Unmute" })).toBeVisible();
    const siri = full.getByTestId("siri-play");
    const siriWave = full.getByTestId("siri-wave");
    await expect(siri).toHaveAttribute("data-level", "0.00");
    await expect(siriWave).toHaveAttribute("data-playing", "true");
    await expect(siriWave).toHaveAttribute("data-ready", "true");

    await full.getByRole("button", { name: "Unmute" }).click();
    await expect(full.getByRole("button", { name: "Mute" })).toBeVisible();
    await expect(siri).toHaveAttribute("data-level", "0.80");
    await expect(siriWave).toBeVisible();

    await siri.hover();
    await expect(
      full.getByTestId("siri-transport-glyph"),
    ).toHaveCSS("opacity", "1");
    await expect(full.getByRole("button", { name: "Pause" })).toBeVisible();

    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Player", exact: true })).toHaveCount(0);

    await page
      .getByRole("button", { name: "Minimize player to a floating window" })
      .click();
    const floating = page.getByTestId("spotify-floating-player");
    await expect(floating).toBeVisible();
    await expect(floating).toContainText("Test Track");
    await expect(floating.getByRole("button", { name: "Mute" })).toBeVisible();
    await floating.getByRole("button", { name: "Mute" }).click();
    await expect(
      floating.getByRole("button", { name: "Unmute" }),
    ).toBeVisible();
    await floating.getByRole("button", { name: "Unmute" }).click();
    await expect(floating.getByRole("button", { name: "Mute" })).toBeVisible();
    await expect(full).toHaveCount(0);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    await expect(full).toBeVisible();

    await page
      .getByRole("button", { name: "Dock player" })
      .click();
    await expect(bar).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/search");
  });

  test("animates lyric seeks with a distance-scaled scroll instead of jumping", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/lyrics**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: TEST_LONG_LYRICS,
          plainLyrics: TEST_LONG_LYRICS.replace(
            /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
            "",
          ),
          instrumental: false,
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    const scroller = full.locator(
      '[aria-label="Synced lyrics — select a line to seek"]',
    );
    await expect(
      full.getByRole("button", {
        name: "Seek to lyric: Lyric line 1",
        exact: true,
      }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(scroller).toBeVisible();

    const samples = await scroller.evaluate(async (element) => {
      const section = element.closest('[aria-label="Lyrics"]');
      const target = section?.querySelector<HTMLButtonElement>(
        'button[aria-label="Seek to lyric: Lyric line 44"]',
      );
      if (!target) throw new Error("Lyric target missing");
      const values = [element.scrollTop];
      target.click();
      values.push(element.scrollTop);
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      values.push(element.scrollTop);
      return values;
    });

    const start = samples[0];
    expect(samples[1] - start).toBeLessThan(12);

    await page.waitForTimeout(1_600);
    const settled = await scroller.evaluate((element) => element.scrollTop);
    expect(settled - start).toBeGreaterThan(400);
    expect(samples[2] - start).toBeLessThan((settled - start) * 0.25);

    const fullyVisible = await full
      .getByRole("button", {
        name: "Seek to lyric: Lyric line 44",
        exact: true,
      })
      .evaluate((element) => {
        const line = element.getBoundingClientRect();
        const container = element
          .closest('[aria-label="Synced lyrics — select a line to seek"]')!
          .getBoundingClientRect();
        return (
          line.top >= container.top - 1 && line.bottom <= container.bottom + 1
        );
      });
    expect(fullyVisible).toBe(true);
    await expect(full.locator('.lyrics-line[data-active="true"]')).toContainText(
      "Lyric line 44",
    );

    const nearSamples = await scroller.evaluate(async (element) => {
      const section = element.closest('[aria-label="Lyrics"]');
      const target = section?.querySelector<HTMLButtonElement>(
        'button[aria-label="Seek to lyric: Lyric line 48"]',
      );
      if (!target) throw new Error("Near lyric target missing");
      const values = [element.scrollTop];
      target.click();
      values.push(element.scrollTop);
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      values.push(element.scrollTop);
      return values;
    });

    const nearStart = nearSamples[0];
    expect(nearSamples[1] - nearStart).toBeLessThan(8);
    await page.waitForTimeout(1_000);
    const nearSettled = await scroller.evaluate(
      (element) => element.scrollTop,
    );
    expect(nearSettled - nearStart).toBeGreaterThan(120);
    expect(nearSamples[2] - nearStart).toBeLessThan(
      (nearSettled - nearStart) * 0.3,
    );
    await expect(full.locator('.lyrics-line[data-active="true"]')).toContainText(
      "Lyric line 48",
    );
  });

  test("auto-follows synced lyrics without snapping", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/lyrics**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: TEST_LONG_LYRICS,
          plainLyrics: TEST_LONG_LYRICS.replace(
            /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
            "",
          ),
          instrumental: false,
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    const scroller = full.locator(
      '[aria-label="Synced lyrics — select a line to seek"]',
    );
    await expect(
      full.getByRole("button", {
        name: "Seek to lyric: Lyric line 21",
        exact: true,
      }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(scroller).toBeVisible();

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      (
        window as unknown as {
          __hermesFakePlayer?: { position: number };
        }
      ).__hermesFakePlayer!.position = 61_000;
    });
    await expect
      .poll(
        async () =>
          (await full
            .locator('.lyrics-line[data-active="true"]')
            .textContent()) ?? "",
        { timeout: 4_000 },
      )
      .toContain("Lyric line 21");
    await page.waitForTimeout(900);

    const samples = await page.evaluate(async () => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            position: number;
            getCurrentState: () => Promise<
              Record<string, unknown> & { position: number }
            >;
          };
        }
      ).__hermesFakePlayer;
      const scroller = document.querySelector<HTMLElement>(
        '[aria-label="Synced lyrics — select a line to seek"]',
      );
      if (!fake || !scroller) throw new Error("Lyrics fixture unavailable");
      const original = fake.getCurrentState.bind(fake);
      const startedAt = performance.now();
      const base = fake.position;
      fake.getCurrentState = async () => {
        const state = await original();
        return {
          ...state,
          position: base + (performance.now() - startedAt) * 3,
        };
      };

      const values: number[] = [];
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          values.push(scroller.scrollTop);
          if (performance.now() - start >= 3_600) {
            window.clearInterval(timer);
            resolve();
          }
        }, 20);
      });
      return values;
    });

    const uniquePositions = new Set(samples.map((value) => Math.round(value)))
      .size;
    const maxDrop = Math.max(
      0,
      ...samples.slice(1).map((value, index) => samples[index] - value),
    );
    const maxStep = Math.max(
      1,
      ...samples.slice(1).map((value, index) => Math.abs(value - samples[index])),
    );
    expect(samples[samples.length - 1] - samples[0]).toBeGreaterThan(100);
    expect(uniquePositions).toBeGreaterThan(15);
    expect(maxDrop).toBeLessThan(3);
    expect(maxStep).toBeLessThan(40);
  });

  test("keeps lyric scrolling smooth while the wave animates", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/lyrics**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: TEST_LONG_LYRICS,
          plainLyrics: TEST_LONG_LYRICS.replace(
            /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
            "",
          ),
          instrumental: false,
        }),
      }),
    );

    await page.goto("/search");
    await page.getByRole("textbox", { name: /Search songs/ }).fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    const scroller = full.locator(
      '[aria-label="Synced lyrics — select a line to seek"]',
    );
    await expect(
      full.getByRole("button", {
        name: "Seek to lyric: Lyric line 1",
        exact: true,
      }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(full.getByTestId("siri-wave")).toHaveAttribute(
      "data-ready",
      "true",
    );
    const box = await scroller.boundingBox();
    if (!box) throw new Error("Lyrics scroller has no box");

    await page.evaluate(() => {
      const state = window as unknown as {
        __lyricPerfStart?: () => void;
        __lyricPerfStop?: () => Record<string, number>;
      };
      state.__lyricPerfStart = () => {
        const perf = {
          running: true,
          last: 0,
          frames: [] as number[],
          long: [] as number[],
          observer: undefined as PerformanceObserver | undefined,
        };
        (window as unknown as { __lyricPerf?: typeof perf }).__lyricPerf = perf;
        const tick = (now: number) => {
          if (!perf.running) return;
          if (perf.last > 0) perf.frames.push(now - perf.last);
          perf.last = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              perf.long.push(entry.duration);
          });
          observer.observe({ entryTypes: ["longtask"] });
          perf.observer = observer;
        } catch {
          // Long-task observation is optional.
        }
      };
      state.__lyricPerfStop = () => {
        const perf = (
          window as unknown as {
            __lyricPerf: {
              running: boolean;
              frames: number[];
              long: number[];
              observer?: PerformanceObserver;
            };
          }
        ).__lyricPerf;
        perf.running = false;
        perf.observer?.disconnect();
        const frames = perf.frames.slice(5).sort((a, b) => a - b);
        const at = (q: number) =>
          frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ??
          0;
        return {
          frames: frames.length,
          p50: at(0.5),
          p95: at(0.95),
          max: frames[frames.length - 1] ?? 0,
          longCount: perf.long.length,
          longMax: Math.max(0, ...perf.long),
        };
      };
    });

    const measureScroll = async () => {
      await page.evaluate(() =>
        (
          window as unknown as { __lyricPerfStart: () => void }
        ).__lyricPerfStart(),
      );
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const startedAt = Date.now();
      while (Date.now() - startedAt < 1_800) {
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(20);
      }
      return page.evaluate(
        () =>
          (
            window as unknown as {
              __lyricPerfStop: () => Record<string, number>;
            }
          ).__lyricPerfStop(),
      );
    };

    await page.waitForTimeout(1_200);
    const warmup = await measureScroll();
    await page.waitForTimeout(300);
    const baseline = await measureScroll();
    const scrolled = await scroller.evaluate(
      (element) => element.scrollTop,
    );
    await page.waitForTimeout(300);
    const baseline2 = await measureScroll();
    await page.waitForTimeout(300);
    const baseline3 = await measureScroll();

    console.log(
      "LYRIC SCROLL PERF",
      JSON.stringify({ warmup, baseline, baseline2, baseline3, scrolled }),
    );
    expect(scrolled).toBeGreaterThan(0);
    for (const sample of [baseline, baseline2, baseline3]) {
      expect(sample.frames).toBeGreaterThan(30);
      expect(sample.p95).toBeLessThan(60);
      // The per-line blur used to produce >100 ms frames while scrolling.
      expect(sample.max).toBeLessThan(90);
    }
  });

  test("refreshes a retryable plain fallback into synced lyrics", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    let calls = 0;
    await page.route("**/api/lyrics**", async (route) => {
      calls += 1;
      const url = new URL(route.request().url());
      const refresh = url.searchParams.get("refresh") === "1";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: refresh
            ? "[00:01.00] Synced after recovery\n[00:04.00] Second synced line"
            : null,
          plainLyrics: "Plain fallback line",
          instrumental: false,
          retryable: !refresh,
        }),
      });
    });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(full.getByText("Unsynced")).toBeVisible();
    await expect(
      full.getByRole("button", { name: /Seek to lyric: Synced after recovery/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(full.getByText("Unsynced")).toHaveCount(0);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("switches lyric lines on their true playback time", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/lyrics**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: [
            "[00:01.00] Sync line one",
            "[00:03.70] Sync line two",
            "[00:06.10] Sync line three",
            "[00:08.90] Sync line four",
          ].join("\n"),
          instrumental: false,
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(
      full.getByRole("button", {
        name: "Seek to lyric: Sync line one",
        exact: true,
      }),
    ).toBeVisible({ timeout: 12_000 });

    await waitForFakePlayer(page);
    const transitions = await page.evaluate(async () => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            position: number;
            getCurrentState: () => Promise<
              Record<string, unknown> & { position: number }
            >;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      const startedAt = performance.now();
      const base = fake.position;
      fake.getCurrentState = async () => ({
        ...(await original()),
        position: base + (performance.now() - startedAt),
      });

      const lineAt: Record<string, number> = {
        "Sync line two": 3.7,
        "Sync line three": 6.1,
        "Sync line four": 8.9,
      };
      const section = document.querySelector('section[aria-label="Lyrics"]');
      if (!section) throw new Error("Lyrics panel unavailable");

      const samples: Array<{ text: string; at: number; heard: number }> = [];
      await new Promise<void>((resolve) => {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.attributeName !== "data-active") continue;
            const element = mutation.target as HTMLElement;
            if (element.getAttribute("data-active") !== "true") continue;
            const text = (element.textContent ?? "").trim();
            const at = lineAt[text];
            if (at === undefined) continue;
            samples.push({
              text,
              at,
              heard: (base + (performance.now() - startedAt)) / 1000,
            });
          }
          if (samples.length >= 3) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(section, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-active"],
        });
        window.setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 14_000);
      });
      return samples;
    });

    expect(transitions).toHaveLength(3);
    for (const sample of transitions) {
      const lateness = sample.heard - (sample.at - 0.1);
      expect(lateness).toBeGreaterThan(-0.2);
      expect(lateness).toBeLessThan(0.3);
    }
  });

  test("recovers lyrics after a transient service failure", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });
    let attempts = 0;
    await page.route("**/api/lyrics**", (route) => {
      attempts += 1;
      if (attempts < 2) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Lyrics service unavailable" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: TEST_SYNCED_LYRICS,
          plainLyrics: TEST_SYNCED_LYRICS.replace(
            /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
            "",
          ),
          instrumental: false,
        }),
      });
    });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toBeVisible({
      timeout: 12_000,
    });
    await expect(
      full.locator('.lyrics-line[data-active="true"]').first(),
    ).toContainText(/test lyric line/);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  test("hides the lyrics control when a track has no lyrics", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/lyrics**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: false,
          syncedLyrics: null,
          plainLyrics: null,
          instrumental: false,
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();
    await expect(
      full.getByRole("button", { name: "Show lyrics" }),
    ).toHaveCount(0);
    await expect(
      full.getByRole("button", { name: "Hide lyrics" }),
    ).toHaveCount(0);
    await expect(
      full.getByRole("region", { name: "Lyrics" }),
    ).toHaveCount(0);
    await expect(full.getByText("Lyrics unavailable")).toHaveCount(0);
    await expect(
      full.getByRole("button", { name: "Show queue" }),
    ).toBeVisible();
  });

  test("prompts to connect Spotify instead of redirecting on a song click", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: false, premium: false });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();

    await expect(
      page.getByRole("dialog", { name: "Connect account" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/search");
    await expect(
      page.getByText("Sign in once to play full tracks inside Hermes."),
    ).toBeVisible();
  });

  test("explains when an account lacks Spotify Premium", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: false });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();

    await expect(page.getByRole("dialog", { name: "Premium required" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/search");
  });

  test("opens the Connect card from the connected taskbar button", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });

    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("button", { name: "Open connection" }).click();

    await expect(page).toHaveURL(/\/$/);
    const card = page.getByRole("region", {
      name: "Connect",
      exact: true,
    });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: "Spotify connection" }),
    ).toBeVisible();
    await expect(card.getByText("Premium Listener")).toBeVisible();
    await expect(card.getByText("Premium", { exact: true })).toBeVisible();
  });
});


test.describe("instant surface phases", () => {
  test("prefetches lyrics before the full player opens", async ({ page }) => {
    await mockSpotify(page, { connected: true, premium: true });
    let lyricsRequests = 0;
    await page.route("**/api/lyrics**", async (route) => {
      lyricsRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          found: true,
          syncedLyrics: TEST_SYNCED_LYRICS,
          plainLyrics: TEST_SYNCED_LYRICS.replace(
            /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g,
            "",
          ),
          instrumental: false,
        }),
      });
    });

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    await expect
      .poll(() => lyricsRequests, { timeout: 4_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(450);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();
    await expect(
      full.locator('[aria-label="Lyrics"] .skeleton'),
    ).toHaveCount(0);
    await expect(full.getByRole("button", { name: /Seek to lyric: First test lyric line/ })).toBeVisible();
  });

  test("opens an album instantly after hover and on repeat", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/spotify/discover", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          covers: [
            {
              id: "sp-album-1",
              title: "Test Album",
              artist: "Test Artist",
              imageUrl: "/artwork/glass-hours.png",
              albumId: "sp-album-1",
            },
          ],
        }),
      }),
    );
    let albumRequests = 0;
    await page.route("**/api/spotify/album**", async (route) => {
      albumRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          album: TEST_ALBUM,
          tracks: TEST_ALBUM_TRACKS,
        }),
      });
    });

    await page.goto("/");
    const cover = page
      .getByRole("button", { name: "Open Test Album" })
      .first();
    await expect(cover).toBeVisible();
    await cover.hover();
    await expect
      .poll(() => albumRequests, { timeout: 4_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(850);

    await cover.click();
    await expect(page.getByLabel("Loading album songs")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play all" })).toBeVisible({
      timeout: 2_000,
    });
    await page.getByRole("button", { name: "Close album" }).click();

    await cover.click();
    await expect(page.getByLabel("Loading album songs")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play all" })).toBeVisible({
      timeout: 2_000,
    });
    expect(albumRequests).toBe(1);
  });

  test("keeps results visible while re-querying and caches repeats", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    let searchRequests = 0;
    await page.route("**/api/spotify/search**", async (route) => {
      searchRequests += 1;
      const query =
        new URL(route.request().url()).searchParams.get("q") ?? "";
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...FIXTURE,
          query,
          tracks: FIXTURE.tracks.map((track, index) => ({
            ...track,
            name: `${query} track ${index + 1}`,
          })),
        }),
      });
    });

    await page.goto("/search");
    const input = page.getByRole("textbox", { name: /Search songs/ });
    await input.fill("alpha");
    await expect(page.getByText("alpha track 1")).toBeVisible();

    await input.fill("beta");
    await page.waitForTimeout(100);
    await expect(page.getByText("alpha track 1")).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await expect(page.getByText("beta track 1")).toBeVisible({
      timeout: 2_000,
    });

    const requestsBeforeRevisit = searchRequests;
    await input.fill("alpha");
    await expect(page.getByText("alpha track 1")).toBeVisible();
    expect(searchRequests).toBe(requestsBeforeRevisit);
  });

  test("opens Home Stats and Settings without a chunk skeleton", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.route("**/api/spotify/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connected: true,
          stats: {
            version: 1,
            startedAt: null,
            updatedAt: Date.now(),
            totalListenedMs: 0,
            tracks: {},
          },
        }),
      }),
    );
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const watchStageLoading = () =>
      page.evaluate(() => {
        const scope = window as unknown as {
          __stageLoadingSeen?: boolean;
          __stageObserver?: MutationObserver;
        };
        scope.__stageLoadingSeen = Boolean(
          document.querySelector('[data-testid="stage-loading"]'),
        );
        scope.__stageObserver = new MutationObserver(() => {
          if (document.querySelector('[data-testid="stage-loading"]')) {
            scope.__stageLoadingSeen = true;
          }
        });
        scope.__stageObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    const stopStageLoadingWatch = () =>
      page.evaluate(() => {
        const scope = window as unknown as {
          __stageLoadingSeen?: boolean;
          __stageObserver?: MutationObserver;
        };
        scope.__stageObserver?.disconnect();
        scope.__stageObserver = undefined;
        return Boolean(scope.__stageLoadingSeen);
      });

    await nav.getByRole("link", { name: "Stats", exact: true }).hover();
    await page.waitForTimeout(300);
    await watchStageLoading();
    await nav.getByRole("link", { name: "Stats", exact: true }).click();
    const stats = page.getByRole("region", { name: "Stats", exact: true });
    await expect(stats).toBeVisible();
    await expect(
      stats.getByRole("heading", { name: "Your Stats", exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    expect(await stopStageLoadingWatch()).toBe(false);

    await nav.getByRole("link", { name: "Settings", exact: true }).hover();
    await page.waitForTimeout(300);
    await watchStageLoading();
    await nav.getByRole("link", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible({ timeout: 2_000 });
    expect(await stopStageLoadingWatch()).toBe(false);
    await expect(settings.locator(".skeleton")).toHaveCount(0);
  });
});

test.describe("dialog accessibility", () => {
  test("keeps Reset focus stable while playback updates and closes only the dialog on Escape", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "Settings", exact: true }).click();

    const settings = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    await expect(
      settings.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Reset", exact: true }).click();

    const dialog = page.getByRole("dialog", {
      name: "Reset Hermes data?",
    });
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const reset = dialog.getByRole("button", {
      name: "Reset",
      exact: true,
    });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(reset).toBeFocused();
    await page.waitForTimeout(1_500);
    await expect(reset).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Reset", exact: true }),
    ).toBeFocused();
  });
});

test.describe("mobile full player", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("opens the full player without horizontal overflow", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(full.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(
      full.getByRole("button", { name: "Previous track" }),
    ).toBeVisible();
    await expect(
      full.getByRole("button", { name: "Next track" }),
    ).toBeVisible();
    await expect(full.getByRole("button", { name: "Mute" })).toBeVisible();
    await expect(
      full.getByRole("button", { name: "Dock player" }),
    ).toBeVisible();
    await expect(
      full.getByRole("button", {
        name: "Minimize player to a floating window",
      }),
    ).toBeVisible();
  });
});

test.describe("player atmosphere", () => {
  test("adapts the full-player spatial palette to a different cover", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();

    await page
      .getByRole("button", {
        name: "Add Queued Song by Queued Artist to queue",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();

    await expect(full.locator(".np-orb")).toHaveCount(4);
    await expect(full.locator(".np-wash")).toHaveCount(1);
    const orbDurations = await full.locator(".np-orb").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationDuration),
    );
    expect(new Set(orbDurations).size).toBe(4);
    const firstOrb = full.locator(".np-orb--a");
    const orbBefore = await firstOrb.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.waitForTimeout(300);
    expect(
      await firstOrb.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    ).not.toBe(orbBefore);

    const readGrid = () =>
      full.evaluate((element) =>
        Array.from({ length: 9 }, (_, index) =>
          getComputedStyle(element)
            .getPropertyValue(`--np-g${index}`)
            .trim(),
        ),
      );
    await expect
      .poll(async () => new Set(await readGrid()).size, { timeout: 5_000 })
      .toBeGreaterThan(2);
    const firstGrid = await readGrid();
    const activeArt = full.locator('.np-art[data-active="true"]');
    await expect
      .poll(
        () =>
          activeArt.evaluate(
            (element) => getComputedStyle(element).backgroundImage,
          ),
        { timeout: 8_000 },
      )
      .not.toBe("none");
    const firstArt = await activeArt.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    await expect(full.locator(".np-drift")).toHaveCount(0);
    await expect(full.locator(".np-ambient")).toHaveCount(0);

    await full.getByRole("button", { name: "Show queue" }).click();
    await full
      .getByRole("region", { name: "Queue" })
      .getByRole("button", { name: "Play Queued Song" })
      .click();
    await expect(full).toContainText("Queued Song");
    await expect
      .poll(async () => (await readGrid()).join("|"), { timeout: 5_000 })
      .not.toBe(firstGrid.join("|"));

    const secondGrid = await readGrid();
    expect(new Set(secondGrid).size).toBeGreaterThan(2);
    expect(secondGrid).not.toEqual(firstGrid);

    const switchedArt = full.locator('.np-art[data-active="true"]');
    await expect
      .poll(
        () =>
          switchedArt.evaluate(
            (element) => getComputedStyle(element).backgroundImage,
          ),
        { timeout: 8_000 },
      )
      .not.toBe(firstArt);
    expect(
      await switchedArt.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toContain("np-art");
    const artBefore = await switchedArt.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.waitForTimeout(300);
    expect(
      await switchedArt.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    ).not.toBe(artBefore);
  });

  test("slows the ambient field while paused and restores it on resume", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    const atmosphere = full.getByTestId("np-atmosphere");
    await expect(atmosphere).toHaveAttribute("data-playing", "true");

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            getCurrentState: () => Promise<Record<string, unknown>>;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      const state = window as unknown as { __hermesAmbientPaused?: boolean };
      state.__hermesAmbientPaused = false;
      fake.getCurrentState = async () => ({
        ...(await original()),
        paused: Boolean(state.__hermesAmbientPaused),
      });
    });

    const readRate = () =>
      full.locator(".np-orb--a").evaluate((element) => {
        const animation = element.getAnimations()[0];
        return animation?.playbackRate ?? 1;
      });

    await page.evaluate(() => {
      (
        window as unknown as { __hermesAmbientPaused?: boolean }
      ).__hermesAmbientPaused = true;
    });
    await expect(atmosphere).toHaveAttribute("data-playing", "false", {
      timeout: 3_000,
    });
    await page.waitForTimeout(1_400);
    expect(await readRate()).toBeLessThan(0.2);

    const pausedTransform = await full
      .locator(".np-orb--a")
      .evaluate((element) => getComputedStyle(element).transform);
    await page.waitForTimeout(300);
    expect(
      await full
        .locator(".np-orb--a")
        .evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(pausedTransform);

    await page.evaluate(() => {
      (
        window as unknown as { __hermesAmbientPaused?: boolean }
      ).__hermesAmbientPaused = false;
    });
    await expect(atmosphere).toHaveAttribute("data-playing", "true", {
      timeout: 3_000,
    });
    await page.waitForTimeout(1_200);
    expect(await readRate()).toBeGreaterThan(0.9);
  });

  test("disables ambient field motion when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    await expect(full.locator(".np-orb--a")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(full.locator(".np-wash")).toHaveCSS("animation-name", "none");
    await expect(full.locator(".np-art").first()).toHaveCSS(
      "animation-name",
      "none",
    );
  });

  test("keeps the ambient field drifting while paused in lite quality", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search?perf=lite");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const full = page.getByTestId("spotify-full-player");
    const atmosphere = full.getByTestId("np-atmosphere");
    await expect(atmosphere).toHaveAttribute("data-playing", "true");
    await expect(page.locator("html")).toHaveAttribute(
      "data-quality",
      "lite",
    );
    await expect(full.locator(".np-art")).toHaveCount(2);
    await expect(full.locator('.np-art[data-active="true"]')).toHaveCSS(
      "animation-play-state",
      /running/,
    );

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            getCurrentState: () => Promise<Record<string, unknown>>;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      fake.getCurrentState = async () => ({
        ...(await original()),
        paused: true,
      });
    });

    await expect(atmosphere).toHaveAttribute("data-playing", "false", {
      timeout: 3_000,
    });
    await expect(full.getByTestId("siri-wave")).toHaveAttribute(
      "data-playing",
      "false",
    );
    const pausedArt = full.locator('.np-art[data-active="true"]');
    await expect(pausedArt).toHaveCSS("animation-play-state", /running/);
    const pausedBefore = await pausedArt.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await page.waitForTimeout(300);
    expect(
      await pausedArt.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    ).not.toBe(pausedBefore);
  });

});

test.describe("Home docking", () => {
  test("never shows the bottom dock on Home, even after Dock player", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByTestId("spotify-player-bar")).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();
    await expect(page.getByTestId("spotify-player-bar")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    await expect(full).toBeVisible();

    await full.getByRole("button", { name: "Dock player" }).click();
    await expect(full).toHaveCount(0);
    await expect(page.getByTestId("spotify-player-bar")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Test Track" }),
    ).toBeVisible();

    await page.goBack();
    const bar = page.getByTestId("spotify-player-bar");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Test Track");
  });
});

test.describe("Siri Wave transport", () => {
  test("follows play, pause, volume and track changes", async ({ page }) => {
    const calls = await mockSpotify(page, {
      connected: true,
      premium: true,
    });
    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect
      .poll(() => calls.wasPlayCalled(), { timeout: 5_000 })
      .toBe(true);

    await page
      .getByRole("button", {
        name: "Add Another Song by Another Artist to queue",
      })
      .click();
    await expect.poll(() => calls.queuedUris().length).toBe(1);

    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();
    const full = page.getByTestId("spotify-full-player");
    const siri = full.getByTestId("siri-play");
    const wave = full.getByTestId("siri-wave");
    const glyph = full.getByTestId("siri-transport-glyph");
    await expect(wave).toHaveAttribute("data-ready", "true");
    await expect(wave).toHaveAttribute("data-playing", "true");
    await expect(wave).toHaveAttribute("data-variant", "wave");
    await expect(glyph).toHaveCSS("opacity", "0");
    await expect(wave).toHaveCSS("opacity", "1");
    await siri.hover();
    await expect(glyph).toHaveCSS("opacity", "1");
    await expect(wave).toHaveCSS("opacity", "0");
    await page.mouse.move(20, 500);
    const firstTrackKey = await siri.getAttribute("data-track-key");

    await waitForFakePlayer(page);
    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            getCurrentState: () => Promise<Record<string, unknown>>;
          };
        }
      ).__hermesFakePlayer;
      if (!fake) throw new Error("Fake player unavailable");
      const original = fake.getCurrentState.bind(fake);
      (
        window as unknown as {
          __hermesOriginalGetState?: () => Promise<Record<string, unknown>>;
        }
      ).__hermesOriginalGetState = original;
      fake.getCurrentState = async () => ({
        ...(await original()),
        paused: true,
      });
    });
    await expect(siri).toHaveAttribute("data-playing", "false", {
      timeout: 3_000,
    });
    await expect(wave).toHaveAttribute("data-playing", "false");
    await expect(siri).toHaveAttribute("aria-label", "Play");
    await expect(wave).toHaveCSS("opacity", "1");
    await expect(glyph).toHaveCSS("opacity", "0");

    await page.evaluate(() => {
      const fake = (
        window as unknown as {
          __hermesFakePlayer?: {
            getCurrentState: () => Promise<Record<string, unknown>>;
          };
        }
      ).__hermesFakePlayer;
      const original = (
        window as unknown as {
          __hermesOriginalGetState?: () => Promise<Record<string, unknown>>;
        }
      ).__hermesOriginalGetState;
      if (fake && original) fake.getCurrentState = original;
    });
    await siri.click();
    await expect(siri).toHaveAttribute("data-playing", "true");
    await expect(siri).toHaveAttribute("aria-label", "Pause");
    await expect(siri).toHaveAttribute("data-settled", "true");
    await expect(wave).toHaveCSS("opacity", "1");
    await expect(glyph).toHaveCSS("opacity", "0");

    await full.getByRole("button", { name: "Next track" }).click();
    await expect(
      full.getByRole("heading", { name: "Another Song" }),
    ).toBeVisible();
    await expect(siri).not.toHaveAttribute(
      "data-track-key",
      firstTrackKey ?? "",
    );
    await expect(wave).toHaveAttribute("data-ready", "true");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(20, 500);
    await expect(glyph).toHaveCSS("opacity", "0");
    await expect(wave).toHaveCSS("opacity", "1");
    await siri.hover();
    await expect(glyph).toHaveCSS("opacity", "1");
    await expect(wave).toHaveCSS("opacity", "0");
    await expect(siri).toHaveAttribute("aria-label", "Pause");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("morphs to the circle without reflow and submerges after inactivity", async ({
    page,
  }) => {
    await mockSpotify(page, { connected: true, premium: true });
    await page.goto("/search?perf=full");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("test");
    await page
      .getByRole("button", {
        name: "Play Test Track by Test Artist in Hermes",
      })
      .click();
    await page
      .getByRole("button", { name: "Open full player" })
      .first()
      .click();

    const transport = page.getByTestId("np-transport");
    const hero = transport.getByTestId("siri-play");
    const glass = hero.locator(".siri-play-glass");
    const circle = hero.locator(".siri-play-circle");
    const wave = hero.getByTestId("siri-wave");
    const tips = transport.locator(":scope > .tip");
    await expect(transport).toBeVisible();
    await expect(page.locator("button[title], a[title]")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll(".tip")].filter((element) => {
            const content = getComputedStyle(element, "::after").content;
            return content && content !== "none" && content !== "normal";
          }).length,
      ),
    ).toBe(0);

    const rowBox = await transport.boundingBox();
    const heroBox = await hero.boundingBox();
    const prevBox = await tips.first().boundingBox();
    expect(rowBox && heroBox && prevBox).toBeTruthy();
    const gapX = prevBox!.x + prevBox!.width + 8;

    // Wake without hovering the hero, then settle in the gap so it expands.
    await page.mouse.move(rowBox!.x + 6, rowBox!.y + rowBox!.height / 2);
    await page.mouse.move(gapX, heroBox!.y + heroBox!.height / 2);
    await expect(transport).toHaveAttribute("data-submerged", "false");
    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);
    const normalGap = await transport.evaluate(
      (element) => parseFloat(getComputedStyle(element).gap),
    );
    const normalPrevBox = await tips.first().boundingBox();

    const hoverBox = await hero.boundingBox();
    await page.mouse.move(
      (hoverBox?.x ?? 0) + (hoverBox?.width ?? 0) / 2,
      (hoverBox?.y ?? 0) + (hoverBox?.height ?? 0) / 2,
    );
    const instantSwap = await page.evaluate(async () => {
      const siri = document.querySelector<HTMLElement>(
        '[data-testid="siri-play"]',
      );
      const wave = siri?.querySelector<HTMLElement>(
        '[data-testid="siri-wave"]',
      );
      const glyph = siri?.querySelector<HTMLElement>(
        '[data-testid="siri-transport-glyph"]',
      );
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      return {
        wave: wave ? getComputedStyle(wave).opacity : null,
        glyph: glyph ? getComputedStyle(glyph).opacity : null,
      };
    });
    expect(instantSwap.wave).toBe("0");
    expect(instantSwap.glyph).toBe("1");

    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);
    await expect
      .poll(() =>
        circle.evaluate((element) =>
          parseFloat(getComputedStyle(element).width),
        ),
      )
      .toBeLessThan(120);
    await expect
      .poll(() =>
        circle.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("1");
    // The layout box, flex gap, and wave resolution must not move on hover:
    // only the circle layer and skip-button transforms change.
    expect(
      await hero.evaluate((element) =>
        parseFloat(getComputedStyle(element).borderTopLeftRadius),
      ),
    ).toBeLessThan(40);
    expect(
      await transport.evaluate(
        (element) => parseFloat(getComputedStyle(element).gap),
      ),
    ).toBe(normalGap);
    const hoverPrevBox = await tips.first().boundingBox();
    expect(hoverPrevBox).toBeTruthy();
    expect(normalPrevBox).toBeTruthy();
    await expect
      .poll(async () => (await tips.first().boundingBox())?.x ?? 0)
      .toBeGreaterThan(normalPrevBox!.x + 20);
    expect(
      await wave.evaluate((element) => (element as HTMLCanvasElement).width),
    ).toBe(200);

    await hero.click();
    await expect(hero).toHaveAttribute("data-settled", "true");
    await expect(wave).toHaveCSS("opacity", "1");
    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);
    expect(
      await wave.evaluate(
        (element) => (element as HTMLCanvasElement).width,
      ),
    ).toBe(200);

    await hero.click();
    await expect(wave).toHaveAttribute("data-playing", "true");
    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);

    await page.mouse.move(gapX, heroBox!.y + heroBox!.height / 2);
    await expect
      .poll(() =>
        circle.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("0");
    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);
    await page.mouse.move(60, 220);
    await expect(transport).toHaveAttribute("data-submerged", "true", {
      timeout: 1_800,
    });
    await expect(glass).toHaveCSS("opacity", "0");
    await expect(tips.first()).toHaveCSS("opacity", "0");
    await expect(wave).toHaveCSS("opacity", "1");
    await expect(wave).toHaveAttribute("data-playing", "true");

    await hero.hover();
    await expect(transport).toHaveAttribute("data-submerged", "false");
    await expect(circle).toHaveCSS("opacity", "1");
    await expect(glass).toHaveCSS("opacity", "0");
    await expect
      .poll(() =>
        hero.evaluate((element) => parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(180);
  });

});
