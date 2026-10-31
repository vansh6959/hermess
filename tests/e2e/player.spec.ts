import { expect, test } from "@playwright/test";

const SPOTIFY_FIXTURE = {
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
  ],
  albums: [
    {
      id: "sp-album-1",
      name: "Test Album",
      artists: "Test Artist",
      imageUrl: "/artwork/glass-hours.png",
      releaseYear: "2024",
      totalTracks: 10,
      spotifyUrl: "https://open.spotify.com/album/sp-album-1",
    },
  ],
  artists: [
    {
      id: "sp-artist-1",
      name: "Test Artist",
      imageUrl: "/artwork/glass-hours.png",
      genres: ["art pop"],
      spotifyUrl: "https://open.spotify.com/artist/sp-artist-1",
    },
  ],
};

function spotifySearchResponse(query: string) {
  return { ...SPOTIFY_FIXTURE, query };
}

async function mockDiscover(
  page: import("@playwright/test").Page,
  options: { connected?: boolean } = {},
) {
  const connected = options.connected ?? true;
  await page.route("**/api/spotify/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connected,
        profile: connected
          ? {
              id: "test-user",
              displayName: "Library Listener",
              imageUrl: null,
              product: "free",
              premium: false,
            }
          : null,
      }),
    }),
  );
  await page.route("**/api/spotify/discover", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        covers: Array.from({ length: 6 }, (_, index) => ({
          id: `discover-${index}`,
          title: `Discover ${index}`,
          artist: "International Artist",
          imageUrl:
            index % 2 === 0
              ? "/artwork/glass-hours.png"
              : "/artwork/paper-moons.png",
          trackId: `discover-track-${index}`,
          albumId: `discover-album-${index}`,
        })),
      }),
    }),
  );
}

function librarySeed(count: number) {
  const playlists = Array.from({ length: count }, (_, index) => {
    const group = index % 8;
    const track = {
      id: `seed-track-${index}`,
      source: "spotify",
      name: `Seed Song ${index}`,
      artists: `Seed Artist ${group}`,
      albumName: `Seed Album ${group}`,
      imageUrl:
        index % 2 === 0
          ? "/artwork/glass-hours.png"
          : "/artwork/paper-moons.png",
      durationMs: 180000,
      url: `https://open.spotify.com/track/seed-track-${index}`,
    };
    return {
      id: `seed-playlist-${index}`,
      source: "spotify",
      name: `Playlist ${String(index).padStart(3, "0")}`,
      description: null,
      imageUrl: index % 3 === 0 ? null : track.imageUrl,
      trackCount: 1,
      tracks: [track],
      url: null,
      importedAt: 1_700_000_000_000 - index * 1000,
    };
  });
  return {
    state: {
      playlists,
      likedSongs: [],
      lastImportedAt: Date.now(),
    },
    version: 1,
  };
}

async function seedLibrary(
  page: import("@playwright/test").Page,
  count: number,
) {
  await page.addInitScript((data) => {
    if (!localStorage.getItem("hermes.library.imported.v1")) {
      localStorage.setItem("hermes.library.imported.v1", JSON.stringify(data));
    }
  }, librarySeed(count));
}

test.describe("search", () => {
  test("command palette shows a Spotify configuration notice without local results", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/search**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "not_configured",
            message: "Playback is not configured on the server.",
          },
        }),
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Open search" }).click();

    const dialog = page.getByRole("dialog", { name: "Search Hermes" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Recent searches")).toHaveCount(0);
    await expect(dialog.getByText("glass hours")).toHaveCount(0);
    await expect(dialog.getByText("mira vale")).toHaveCount(0);
    await dialog
      .getByRole("combobox", { name: /Search songs/ })
      .fill("afterglow");

    await expect(
      dialog.getByText("Playback is not configured on the server."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Afterglow/ }),
    ).toHaveCount(0);
  });

  test("renders live Spotify tracks, albums and artists", async ({
    page,
  }) => {
    await page.route("**/api/spotify/search**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const url = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(spotifySearchResponse(url.searchParams.get("q") ?? "")),
      });
    });
    await page.route("**/api/spotify/artist-detail**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artist: {
            id: "sp-artist-1",
            name: "Test Artist",
            imageUrl: "/artwork/glass-hours.png",
            followers: 2_400_000,
            genres: ["art pop"],
            popularity: 72,
            spotifyUrl: "https://open.spotify.com/artist/sp-artist-1",
          },
          albums: [
            {
              id: "sp-album-1",
              name: "Test Album",
              artists: "Test Artist",
              imageUrl: "/artwork/glass-hours.png",
              releaseYear: "2024",
              totalTracks: 10,
              albumType: "album",
              spotifyUrl: "https://open.spotify.com/album/sp-album-1",
            },
          ],
          singles: [],
          topTracks: [],
        }),
      }),
    );

    await page.goto("/search");
    const input = page.getByRole("textbox", {
      name: /Search songs/,
    });
    await input.fill("test");
    await expect(page.getByTestId("spotify-search-loading")).toBeVisible();

    await expect(
      page.getByRole("link", {
        name: "Open Test Track by Test Artist externally",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Open Test Album by Test Artist externally",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open Test Artist externally" }),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Open Test Artist artist page" })
      .click();
    const artistDialog = page.getByRole("dialog", {
      name: "Test Artist artist",
    });
    await expect(artistDialog).toBeVisible();
    await expect(
      artistDialog.getByRole("heading", { name: "Test Album", exact: true }),
    ).toBeVisible();
    await expect(
      artistDialog.getByRole("heading", { name: "About", exact: true }),
    ).toBeVisible();
    await artistDialog
      .getByRole("button", { name: "Close Test Artist artist" })
      .click();
  });

  test("renders Spotify results in the command palette", async ({ page }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/search**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          spotifySearchResponse(new URL(route.request().url()).searchParams.get("q") ?? ""),
        ),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open search" }).click();
    const dialog = page.getByRole("dialog", { name: "Search Hermes" });
    await dialog
      .getByRole("combobox", { name: /Search songs/ })
      .fill("test");

    const track = dialog.getByRole("option", { name: /Test Track/ }).first();
    await expect(track).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /Test Track/ }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: "Add Test Track by Test Artist to playlist",
      }),
    ).toBeVisible();
  });

  test("opens full search from the palette and guides short queries", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/search**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          spotifySearchResponse(
            new URL(route.request().url()).searchParams.get("q") ?? "",
          ),
        ),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open search" }).click();
    const dialog = page.getByRole("dialog", { name: "Search Hermes" });
    const input = dialog.getByRole("combobox", { name: /Search songs/ });

    await input.fill("t");
    await expect(
      dialog.getByText("Type one more character to search."),
    ).toBeVisible();

    await input.fill("test");
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await expect(input).toHaveAttribute(
      "aria-activedescendant",
      /search-row-/,
    );

    await dialog
      .getByRole("button", { name: /View all results/ })
      .click();
    await expect(page).toHaveURL(/\/search\?q=test/);
    const fullSearch = page.getByRole("textbox", {
      name: /Search songs/,
    });
    await expect(fullSearch).toHaveValue("test");
    await expect(page.getByText("Test Track").first()).toBeVisible();
  });

  test("shows a Spotify error notice without fake local results", async ({
    page,
  }) => {
    await page.route("**/api/spotify/search**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "not_configured",
            message: "Playback is not configured on the server.",
          },
        }),
      }),
    );

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("afterglow");

    await expect(
      page.getByText("Playback is not configured on the server."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play Afterglow" }),
    ).toHaveCount(0);
  });
});

test.describe("library", () => {
  test("automatically syncs a connected Spotify library without opening Import", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/import", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "spotify",
          playlists: [
            {
              id: "auto-playlist-1",
              source: "spotify",
              name: "Auto Playlist",
              description: null,
              imageUrl: null,
              trackCount: 1,
              tracks: [
                {
                  id: "auto-track-1",
                  source: "spotify",
                  name: "Auto Track",
                  artists: "Auto Artist",
                  albumName: "Auto Album",
                  imageUrl: null,
                  durationMs: 180000,
                  url: "https://open.spotify.com/track/auto-track-1",
                },
              ],
              url: null,
              importedAt: Date.now(),
            },
          ],
          likedSongs: [
            {
              id: "auto-liked-1",
              source: "spotify",
              name: "Auto Liked",
              artists: "Auto Artist",
              albumName: "Auto Album",
              imageUrl: null,
              durationMs: 190000,
              url: "https://open.spotify.com/track/auto-liked-1",
            },
          ],
        }),
      }),
    );

    await page.goto("/library");

    await expect(
      page.getByRole("button", { name: "Auto Playlist", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Liked songs", { exact: true }).first(),
    ).toBeVisible();
  });

  test("shows a distinct loading state while the connected library syncs", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/import", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "spotify",
          playlists: [
            {
              id: "loading-playlist",
              source: "spotify",
              name: "Loading Playlist",
              description: null,
              imageUrl: null,
              trackCount: 0,
              tracks: [],
              url: null,
              importedAt: Date.now(),
            },
          ],
          likedSongs: [],
        }),
      });
    });

    await page.goto("/library");
    await expect(page.getByText("Syncing your Spotify library…")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Loading Playlist", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Syncing your Spotify library…")).toHaveCount(0);
  });

  test("shows a reconnect notice when the library needs Spotify consent", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/import", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "needs_scope",
            message: "Reconnect Spotify to grant playlist and liked-songs access.",
          },
          needsScope: true,
        }),
      }),
    );

    await page.goto("/library");
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(
      "Reconnect Spotify to grant playlist and liked-songs access.",
    );
    await expect(alert.getByRole("link", { name: "Reconnect" })).toHaveAttribute(
      "href",
      "/api/auth/spotify/login?returnTo=%2Flibrary",
    );
  });

  test("reports a genuinely empty Spotify library honestly", async ({ page }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/import", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "spotify",
          playlists: [],
          likedSongs: [],
        }),
      }),
    );

    await page.goto("/library");
    await expect(
      page.getByText("No playlists or liked songs were found in this Spotify account."),
    ).toBeVisible();
    await expect(page.getByText("Hidden Set", { exact: true })).toHaveCount(0);
  });

  test("retries a failed library sync and keeps the connected page usable", async ({
    page,
  }) => {
    await mockDiscover(page);
    let attempts = 0;
    await page.route("**/api/spotify/import", (route) => {
      attempts += 1;
      if (attempts === 1) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "spotify_error",
              message: "Spotify could not complete the import. Try again.",
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "spotify",
          playlists: [
            {
              id: "retry-playlist",
              source: "spotify",
              name: "Recovered Playlist",
              description: null,
              imageUrl: null,
              trackCount: 0,
              tracks: [],
              url: null,
              importedAt: Date.now(),
            },
          ],
          likedSongs: [],
        }),
      });
    });

    await page.goto("/library");
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText(
      "Spotify could not complete the import. Try again.",
    );
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(
      page.getByRole("button", { name: "Recovered Playlist", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(attempts).toBe(2);
  });

  test("shows real recent history only in the compact playback panel", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.addInitScript(() => {
      const tracks = Array.from({ length: 8 }, (_, index) => ({
        id: `history-${index}`,
        name: `Song ${index}`,
        artists: `Artist ${index}`,
        albumName: `Album ${index}`,
        imageUrl:
          index % 2 === 0 ? "/artwork/glass-hours.png" : "/artwork/paper-moons.png",
        spotifyUrl: `https://open.spotify.com/track/history-${index}`,
        playedAt: Date.now() - index * 1000,
      }));
      localStorage.setItem("hermes.spotify.history.v1", JSON.stringify(tracks));
    });

    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recently played" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Recently played" }),
    ).toHaveCount(0);
    const right = page.getByTestId("library-right");
    await expect(right.getByText("Song 0", { exact: true })).toBeVisible();
    await expect(
      right.getByRole("button", { name: "Recent 8", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Discover 0", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Mira Vale", { exact: true })).toHaveCount(0);
  });

  test("keeps both Library columns bottom-aligned for 10, 30 or 300 playlists", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/library");
    await expect(page.getByTestId("library-left")).toBeVisible();

    for (const count of [10, 30, 300]) {
      await page.evaluate((data) => {
        localStorage.setItem(
          "hermes.library.imported.v1",
          JSON.stringify(data),
        );
      }, librarySeed(count));
      await page.reload();
      await expect(page.getByTestId("library-left")).toBeVisible();
      await expect(page.getByTestId("library-right")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your Library" }),
      ).toBeVisible();

      const layout = await page.evaluate(() => {
        const left = document
          .querySelector('[data-testid="library-left"]')!
          .getBoundingClientRect();
        const right = document
          .querySelector('[data-testid="library-right"]')!
          .getBoundingClientRect();
        const scroller = document.querySelector(
          '[data-testid="library-playlist-scroll"]',
        ) as HTMLElement;
        return {
          leftTop: left.top,
          leftBottom: left.bottom,
          leftHeight: left.height,
          rightTop: right.top,
          rightBottom: right.bottom,
          rightHeight: right.height,
          overflowY: getComputedStyle(scroller).overflowY,
          scrollable: scroller.scrollHeight > scroller.clientHeight,
          pageScrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          pageScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });

      expect(Math.abs(layout.leftBottom - layout.rightBottom)).toBeLessThan(1);
      expect(Math.abs(layout.leftTop - layout.rightTop)).toBeLessThan(1);
      expect(Math.abs(layout.leftHeight - layout.rightHeight)).toBeLessThan(1);
      expect(layout.overflowY).toBe("auto");
      if (count > 10) expect(layout.scrollable).toBe(true);
      expect(layout.pageScrollHeight).toBeLessThanOrEqual(
        layout.innerHeight + 1,
      );
      expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.innerWidth);
    }
  });

  test("searches, filters and sorts the real library", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/artists**", (route) => {
      const names = new URL(route.request().url()).searchParams.getAll("name");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artists: names.map((name) => ({
            name,
            imageUrl: "/artwork/glass-hours.png",
          })),
        }),
      });
    });
    await page.route("**/api/spotify/artist-detail**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artist: {
            id: "artist-weeknd",
            name: "The Weeknd",
            imageUrl: "/artwork/glass-hours.png",
            followers: 1_234_567,
            genres: ["pop", "r&b"],
            popularity: 96,
            spotifyUrl: "https://open.spotify.com/artist/weeknd",
          },
          albums: [
            {
              id: "album-starboy",
              name: "Starboy",
              artists: "The Weeknd",
              imageUrl: "/artwork/glass-hours.png",
              releaseYear: "2016",
              releaseDate: "2016-11-25",
              totalTracks: 18,
              albumType: "album",
              spotifyUrl: "https://open.spotify.com/album/starboy",
            },
          ],
          singles: [],
          topTracks: [],
        }),
      }),
    );
    await page.addInitScript(() => {
      if (localStorage.getItem("hermes.library.imported.v1")) return;
      const makeTrack = (index: number, name: string) => ({
        id: `interaction-track-${index}`,
        source: "spotify",
        name,
        artists: index % 2 === 0 ? "The Weeknd" : "SZA",
        albumName: index % 2 === 0 ? "After Hours" : "SOS",
        imageUrl: "/artwork/glass-hours.png",
        durationMs: 180000,
        url: `https://open.spotify.com/track/interaction-track-${index}`,
      });
      const playlists = [
        ["zulu", "Zulu", 0],
        ["beta", "Beta", 1],
        ["mango", "Mango", 2],
        ["alpha", "Alpha", 3],
      ].map(([id, name, age], index) => {
        const track = makeTrack(index, `${name} Song`);
        return {
          id: `interaction-${id}`,
          source: "spotify",
          name,
          description: null,
          imageUrl: null,
          trackCount: 1,
          tracks: [track],
          url: null,
          importedAt: Date.now() - Number(age) * 60_000,
        };
      });
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists,
            likedSongs: [],
            lastImportedAt: Date.now(),
          },
          version: 1,
        }),
      );
    });

    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();

    await page
      .getByRole("textbox", { name: "Search your library" })
      .fill("Mango");
    await expect(
      page.getByRole("button", { name: "Mango", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Zulu", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Clear library search" }).click();

    await page.getByRole("button", { name: /^Albums \(/ }).click();
    await expect(
      page.getByRole("heading", { name: "Albums", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "After Hours", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Artists \(/ }).click();
    await expect(
      page.getByRole("heading", { name: "Artists", exact: true }),
    ).toBeVisible();
    const weekndRow = page.getByRole("button", {
      name: "The Weeknd",
      exact: true,
    });
    const szaRow = page.getByRole("button", { name: "SZA", exact: true });
    await expect(weekndRow).toBeVisible();
    await expect(szaRow).toBeVisible();
    await expect(weekndRow.locator("img")).toBeVisible();
    await expect(szaRow.locator("img")).toBeVisible();
    await expect(weekndRow.locator("img")).toHaveAttribute(
      "src",
      /glass-hours/,
    );

    await weekndRow.click();
    const artistDialog = page.getByRole("dialog", {
      name: "The Weeknd artist",
    });
    await expect(artistDialog).toBeVisible();
    await expect(
      artistDialog.getByRole("heading", { name: "The Weeknd" }),
    ).toBeVisible();
    await expect(
      artistDialog.getByRole("heading", { name: "Albums" }),
    ).toBeVisible();
    await expect(artistDialog.getByText("Starboy", { exact: true }).first()).toBeVisible();
    await expect(
      artistDialog.getByRole("heading", { name: "About" }),
    ).toBeVisible();
    await expect(artistDialog.getByText("1.2M followers")).toBeVisible();
    await artistDialog
      .getByRole("button", { name: "Close The Weeknd artist" })
      .click();

    await page.getByRole("button", { name: /^Playlists \(/ }).click();
    const playlistsSection = page.getByRole("region", {
      name: "Playlists",
    });
    const firstRecent = await playlistsSection
      .locator("li")
      .first()
      .getByRole("button")
      .first()
      .getAttribute("aria-label");
    expect(firstRecent).toBe("Zulu");
    await page
      .getByRole("button", { name: /Sort by recently added/ })
      .click();
    const firstSorted = await playlistsSection
      .locator("li")
      .first()
      .getByRole("button")
      .first()
      .getAttribute("aria-label");
    expect(firstSorted).toBe("Alpha");
  });

  test("opens a library artist with imported albums when Spotify is rate-limited", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/artists**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artists: [{ name: "The Weeknd", imageUrl: "/artwork/glass-hours.png" }],
        }),
      }),
    );
    await page.route("**/api/spotify/artist-detail**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "unavailable",
            message: "Service rate limit reached.",
          },
        }),
      }),
    );
    await page.addInitScript(() => {
      if (localStorage.getItem("hermes.library.imported.v1")) return;
      const tracks = [
        {
          id: "weeknd-track-1",
          source: "spotify",
          name: "Starboy",
          artists: "The Weeknd",
          albumName: "Starboy",
          imageUrl: "/artwork/glass-hours.png",
          durationMs: 200000,
          url: "https://open.spotify.com/track/weeknd-track-1",
        },
        {
          id: "weeknd-track-2",
          source: "spotify",
          name: "Blinding Lights",
          artists: "The Weeknd",
          albumName: "After Hours",
          imageUrl: "/artwork/paper-moons.png",
          durationMs: 200000,
          url: "https://open.spotify.com/track/weeknd-track-2",
        },
      ];
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists: [
              {
                id: "weeknd-list",
                source: "spotify",
                name: "Weeknd Mix",
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

    await page.goto("/library");
    await page.getByRole("button", { name: /^Artists \(/ }).click();
    await page
      .getByRole("button", { name: "The Weeknd", exact: true })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "The Weeknd artist",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/rate-limiting artist details/),
    ).toBeVisible();
    await expect(
      dialog.getByText(/Showing your imported library/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Albums in your library" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Starboy", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      dialog.getByText("After Hours", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "About", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Could not load The Weeknd")).toHaveCount(0);
  });

  test("shows every song in an opened playlist with an internal scroll", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.addInitScript(() => {
      const tracks = Array.from({ length: 30 }, (_, index) => ({
        id: `long-track-${index}`,
        source: "spotify",
        name: `Song ${index}`,
        artists: "Mira Vale",
        albumName: "Long Set",
        imageUrl:
          index % 2 === 0
            ? "/artwork/glass-hours.png"
            : "/artwork/paper-moons.png",
        durationMs: 180000 + index * 1000,
        url: `https://open.spotify.com/track/long-track-${index}`,
      }));
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists: [
              {
                id: "long-set",
                source: "spotify",
                name: "Long Set",
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

    await page.goto("/library");
    await page.getByRole("button", { name: "Long Set", exact: true }).click();

    const panel = page.getByRole("region", { name: "Long Set" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("ul li")).toHaveCount(30);
    await expect(panel.locator("ul li img")).toHaveCount(30);
    await expect(
      panel.getByRole("button", { name: "Play Song 29" }),
    ).toBeAttached();

    const scroller = panel.locator(".library-song-scroll");
    await expect(scroller).toBeVisible();
    const scrollState = await scroller.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollable: element.scrollHeight > element.clientHeight,
    }));
    expect(scrollState.overflowY).toBe("auto");
    expect(scrollState.scrollable).toBe(true);

    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      panel.getByRole("button", { name: "Play Song 29" }),
    ).toBeVisible();
  });
});

test.describe("imports", () => {
  test("imports Spotify playlists and liked songs into the Hermes library", async ({
    page,
  }) => {
    await mockDiscover(page);
    const importedAt = Date.now();
    await page.route("**/api/spotify/import", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "spotify",
          playlists: [
            {
              id: "imported-playlist-1",
              source: "spotify",
              name: "Imported Mix",
              description: null,
              imageUrl: "/artwork/glass-hours.png",
              trackCount: 1,
              tracks: [
                {
                  id: "sp-track-1",
                  source: "spotify",
                  name: "Test Track",
                  artists: "Test Artist",
                  albumName: "Test Album",
                  imageUrl: "/artwork/glass-hours.png",
                  durationMs: 201000,
                  url: "https://open.spotify.com/track/sp-track-1",
                },
              ],
              url: null,
              importedAt,
            },
          ],
          likedSongs: [
            {
              id: "sp-track-1",
              source: "spotify",
              name: "Test Track",
              artists: "Test Artist",
              albumName: "Test Album",
              imageUrl: "/artwork/glass-hours.png",
              durationMs: 201000,
              url: "https://open.spotify.com/track/sp-track-1",
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Import music" }).click();

    const dialog = page.getByRole("dialog", { name: "Import to Hermes" });
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("import-spotify").click();
    await expect(
      dialog.getByText(/Imported 1 playlists and 1 liked songs/),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Close import dialog" }).click();
    await page.goto("/library");

    await expect(
      page.getByRole("button", { name: "Imported Mix", exact: true }),
    ).toBeVisible();
    await expect(page.getByAltText("Imported Mix")).toHaveCount(0);
    await expect(
      page.getByText("Liked songs", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Spotify", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Imported Mix", exact: true }).click();
    const panel = page.getByRole("region", { name: "Imported Mix" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Test Track", { exact: true })).toBeVisible();
    await expect(panel.getByText("Test Artist", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Close Imported Mix" }).click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe("stats", () => {
  const STATS_FIXTURE = {
    version: 1,
    startedAt: Date.UTC(2026, 9, 1),
    updatedAt: Date.UTC(2026, 9, 26),
    totalListenedMs: 11_900_000,
    tracks: {
      t1: {
        id: "t1",
        name: "Starboy",
        artists: "The Weeknd, Daft Punk",
        albumName: "Starboy",
        imageUrl: "/artwork/glass-hours.png",
        spotifyUrl: "https://open.spotify.com/track/t1",
        plays: 8,
        listenedMs: 3_600_000,
        lastPlayedAt: Date.UTC(2026, 9, 26),
      },
      t2: {
        id: "t2",
        name: "HUMBLE.",
        artists: "Kendrick Lamar",
        albumName: "DAMN.",
        imageUrl: "/artwork/paper-moons.png",
        spotifyUrl: "https://open.spotify.com/track/t2",
        plays: 6,
        listenedMs: 2_400_000,
        lastPlayedAt: Date.UTC(2026, 9, 25),
      },
      t3: {
        id: "t3",
        name: "Blinding Lights",
        artists: "The Weeknd",
        albumName: "After Hours",
        imageUrl: "/artwork/glass-hours.png",
        spotifyUrl: "https://open.spotify.com/track/t3",
        plays: 7,
        listenedMs: 2_000_000,
        lastPlayedAt: Date.UTC(2026, 9, 24),
      },
      t4: {
        id: "t4",
        name: "Rap God",
        artists: "Eminem",
        albumName: "The Marshall Mathers LP 2",
        imageUrl: "/artwork/paper-moons.png",
        spotifyUrl: "https://open.spotify.com/track/t4",
        plays: 5,
        listenedMs: 1_800_000,
        lastPlayedAt: Date.UTC(2026, 9, 23),
      },
      t5: {
        id: "t5",
        name: "Snooze",
        artists: "SZA",
        albumName: "SOS",
        imageUrl: "/artwork/glass-hours.png",
        spotifyUrl: "https://open.spotify.com/track/t5",
        plays: 4,
        listenedMs: 1_200_000,
        lastPlayedAt: Date.UTC(2026, 9, 22),
      },
      t6: {
        id: "t6",
        name: "Lost",
        artists: "Frank Ocean",
        albumName: "Blonde",
        imageUrl: "/artwork/paper-moons.png",
        spotifyUrl: "https://open.spotify.com/track/t6",
        plays: 3,
        listenedMs: 900_000,
        lastPlayedAt: Date.UTC(2026, 9, 21),
      },
    },
  };

  async function seedStats(page: import("@playwright/test").Page) {
    await page.addInitScript((stats) => {
      localStorage.setItem("hermes.spotify.stats.v1", JSON.stringify(stats));
    }, STATS_FIXTURE);
  }

  test("shows top five artists, albums and tracks from the taskbar", async ({
    page,
  }) => {
    await mockDiscover(page);
    await seedStats(page);
    await page.route("**/api/spotify/artists**", (route) => {
      const names = new URL(route.request().url()).searchParams.getAll("name");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artists: names.map((name) => ({
            name,
            imageUrl: "/artwork/glass-hours.png",
          })),
        }),
      });
    });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("link", { name: "Stats", exact: true }).click();

    const card = page.getByRole("region", { name: "Stats", exact: true });
    await expect(card.getByRole("heading", { name: "Your Stats" })).toBeVisible();
    await expect(card.getByText("3h 18m", { exact: true })).toBeVisible();
    await expect(card.getByText("33", { exact: true })).toBeVisible();
    await expect(card.getByText(/tracked locally/i)).toHaveCount(0);

    const artists = card.getByRole("region", { name: "Top artists" });
    await expect(artists.locator("ol > li")).toHaveCount(5);
    await expect(artists.locator("ol > li").nth(0)).toContainText("The Weeknd");
    await expect(artists.locator("ol > li").nth(1)).toContainText("Daft Punk");
    const firstArtist = artists.locator("ol > li").nth(0);
    await expect(firstArtist.locator("img")).toBeVisible();

    await firstArtist.hover();
    await expect
      .poll(() =>
        firstArtist.evaluate(
          (element) => getComputedStyle(element).transform,
        ),
      )
      .not.toBe("none");
    const lift = await firstArtist.evaluate((element) => ({
      property: getComputedStyle(element).transitionProperty,
      duration: getComputedStyle(element).transitionDuration,
    }));
    expect(lift.property).toContain("transform");
    expect(lift.duration).toContain("0.3s");
    await page.mouse.move(8, 8);

    await card.getByRole("button", { name: "Close Stats" }).click();
    await expect(card).toHaveCount(0);

    await page.goto("/stats");
    await expect(
      page.getByRole("heading", { name: "Your Stats" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Stats", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    const albums = page.getByRole("region", { name: "Top albums" });
    await expect(albums.locator("ol > li")).toHaveCount(5);
    await expect(albums.locator("ol > li").nth(0)).toContainText("Starboy");
    await expect(albums.locator("ol > li").nth(1)).toContainText("DAMN.");

    const tracks = page.getByRole("region", { name: "Top tracks" });
    await expect(tracks.locator("ol > li")).toHaveCount(5);
    await expect(tracks.locator("ol > li").nth(0)).toContainText("Starboy");
    await expect(tracks.locator("ol > li").nth(1)).toContainText("HUMBLE.");
    await expect(tracks.locator("ol > li").nth(4)).toContainText("Snooze");
  });

  test("retries artist portraits after a transient image failure and caches them", async ({
    page,
  }) => {
    await mockDiscover(page);
    await seedStats(page);
    let artistRequests = 0;
    await page.route("**/api/spotify/artists**", (route) => {
      artistRequests += 1;
      if (artistRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable" } }),
        });
      }
      const names = new URL(route.request().url()).searchParams.getAll("name");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          artists: names.map((name) => ({
            name,
            imageUrl: "/artwork/glass-hours.png",
          })),
        }),
      });
    });
    await page.goto("/stats");

    const artists = page.getByRole("region", { name: "Top artists" });
    const firstArtist = artists.locator("ol > li").nth(0);
    await expect(firstArtist.locator("img")).toBeVisible({ timeout: 12_000 });
    expect(artistRequests).toBeGreaterThanOrEqual(2);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hermes.artist-images.v1"),
      ),
    ).toContain("glass-hours.png");

    const requestsBeforeReload = artistRequests;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your Stats" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Top artists" })
        .locator("ol > li")
        .nth(0)
        .locator("img"),
    ).toBeVisible();
    expect(artistRequests).toBe(requestsBeforeReload);
  });

  test("shows an honest empty stats state", async ({ page }) => {
    await page.goto("/stats");
    await expect(
      page.getByRole("heading", { name: "Your Stats" }),
    ).toBeVisible();
    await expect(
      page.getByText("No listening stats yet", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Starboy", { exact: true })).toHaveCount(0);
  });
});

test.describe("shell", () => {
  test("idle home shows the Let's dive in card with real covers", async ({ page }) => {
    await mockDiscover(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Let's dive in", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Albums from your listening history" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Search music" }),
    ).toHaveCount(0);
    await expect(page.getByText("Glass Hours", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Mira Vale", { exact: true })).toHaveCount(0);
  });

  test("keeps the cover hover chip crisp without backdrop blur", async ({
    page,
  }) => {
    await mockDiscover(page);
    // Freeze the strip so the chip style is measured on a stationary card.
    await page.addInitScript(() => {
      localStorage.setItem(
        "hermes.settings.v1",
        JSON.stringify({
          state: { motionPreference: "reduced", lyricsScale: "normal" },
          version: 1,
        }),
      );
    });
    await page.goto("/");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.motion))
      .toBe("reduced");

    const cover = page
      .getByRole("button", { name: "Open Discover 0" })
      .first();
    await cover.hover();

    const overlay = cover.getByTestId("cover-play-overlay");
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(250);
    const style = await overlay.evaluate((element) => ({
      backdrop: getComputedStyle(element).backdropFilter,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(style.backdrop).toBe("none");
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("shows connect-first empty states when Spotify is disconnected", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists: [
              {
                id: "hidden-set",
                source: "spotify",
                name: "Hidden Set",
                description: null,
                imageUrl: null,
                trackCount: 1,
                tracks: [
                  {
                    id: "hidden-track",
                    source: "spotify",
                    name: "Hidden Track",
                    artists: "Hidden Artist",
                    albumName: "Hidden Set",
                    imageUrl: null,
                    durationMs: 180000,
                    url: "https://open.spotify.com/track/hidden-track",
                  },
                ],
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
    await mockDiscover(page, { connected: false });
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Connect your Spotify account to get started",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Let's dive in", level: 1 }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Albums from your listening history" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Connect Spotify" }),
    ).toBeVisible();

    const nav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    const connectButton = nav.getByRole("button", {
      name: "Open connection",
    });
    await expect(connectButton).toHaveAttribute("data-attention", "true");
    await expect
      .poll(() =>
        connectButton.evaluate(
          (element) => getComputedStyle(element, "::before").animationName,
        ),
      )
      .toContain("nav-connect-breathe");

    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Connect your Spotify account to get started",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hidden Set" }),
    ).toHaveCount(0);
    await expect(page.getByText("Imported playlists")).toHaveCount(0);
  });

  test("keeps curated albums visible alongside a full listening history", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const history = Array.from({ length: 10 }, (_, index) => ({
        id: `history-${index}`,
        name: `History Song ${index}`,
        artists: `History Artist ${index}`,
        albumName: `History Album ${index}`,
        imageUrl:
          index % 2 === 0 ? "/artwork/glass-hours.png" : "/artwork/paper-moons.png",
        spotifyUrl: `https://open.spotify.com/track/history-${index}`,
        playedAt: Date.now() - index * 1000,
      }));
      localStorage.setItem("hermes.spotify.history.v1", JSON.stringify(history));
    });
    await mockDiscover(page);
    await page.route("**/api/spotify/discover", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          covers: [
            {
              id: "album-after-hours",
              title: "After Hours",
              artist: "The Weeknd",
              imageUrl: "/artwork/glass-hours.png",
              albumId: "album-after-hours",
            },
            {
              id: "album-utopia",
              title: "UTOPIA",
              artist: "Travis Scott",
              imageUrl: "/artwork/paper-moons.png",
              albumId: "album-utopia",
            },
            {
              id: "album-mmlp",
              title: "The Marshall Mathers LP",
              artist: "Eminem",
              imageUrl: "/artwork/glass-hours.png",
              albumId: "album-mmlp",
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(
      scroller.getByRole("button", { name: "Open After Hours" }).first(),
    ).toBeVisible();
    await expect(
      scroller.getByRole("button", { name: "Open UTOPIA" }).first(),
    ).toBeVisible();
    await expect(
      scroller.getByRole("button", { name: "Open The Marshall Mathers LP" }).first(),
    ).toBeVisible();
  });

  test("keeps the Home cover strip moving despite OS reduce-motion", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();

    const before = await scroller.evaluate((element) => element.scrollLeft);
    await expect
      .poll(
        async () => {
          const value = await scroller.evaluate(
            (element) => element.scrollLeft,
          );
          return Math.abs(value - before) > 4;
        },
        { timeout: 4_000 },
      )
      .toBe(true);
  });

  test("keeps the Home cover strip moving in lite quality", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/?perf=lite");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.quality),
      )
      .toBe("lite");

    const before = await scroller.evaluate((element) => element.scrollLeft);
    await expect
      .poll(
        async () => {
          const value = await scroller.evaluate(
            (element) => element.scrollLeft,
          );
          return Math.abs(value - before) > 4;
        },
        { timeout: 4_000 },
      )
      .toBe(true);
  });

  test("keeps the Home cover strip moving while hovered", async ({ page }) => {
    await mockDiscover(page);
    await page.goto("/");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const before = await scroller.evaluate((element) => element.scrollLeft);
    await expect
      .poll(
        async () => {
          const value = await scroller.evaluate(
            (element) => element.scrollLeft,
          );
          return Math.abs(value - before) > 4;
        },
        { timeout: 4_000 },
      )
      .toBe(true);
  });

  test("stops the Home cover strip when Hermes reduce motion is on", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "hermes.settings.v1",
        JSON.stringify({
          state: { motionPreference: "reduced", lyricsScale: "normal" },
          version: 1,
        }),
      );
    });
    await page.goto("/");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.motion))
      .toBe("reduced");

    const before = await scroller.evaluate((element) => element.scrollLeft);
    await page.waitForTimeout(700);
    const after = await scroller.evaluate((element) => element.scrollLeft);
    expect(after).toBe(before);
  });

  test("keeps the cover strip moving after a flick", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width * 0.72;
    const endX = box!.x + box!.width * 0.28;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(startX + ((endX - startX) * step) / 6, y);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();

    const samples: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      await page.waitForTimeout(40);
      samples.push(
        await scroller.evaluate((element) => element.scrollLeft),
      );
    }
    expect(new Set(samples.map((value) => Math.round(value))).size).toBeGreaterThan(3);

    await page.waitForTimeout(1_800);
    const afterFling = await scroller.evaluate((element) => element.scrollLeft);
    await page.waitForTimeout(600);
    const final = await scroller.evaluate((element) => element.scrollLeft);
    expect(Math.abs(final - afterFling)).toBeGreaterThan(2);
  });

  test("opens a full playable album from an idle Home cover", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.route("**/api/spotify/album**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          album: {
            id: "discover-album-0",
            name: "Discover 0",
            artists: "International Artist",
            imageUrl: "/artwork/glass-hours.png",
            releaseYear: "2024",
            totalTracks: 2,
            spotifyUrl: "https://open.spotify.com/album/discover-album-0",
          },
          tracks: [
            {
              id: "discover-album-track-1",
              name: "First Light",
              artists: "International Artist",
              albumName: "Discover 0",
              imageUrl: "/artwork/glass-hours.png",
              durationMs: 201000,
              explicit: false,
              spotifyUrl: "https://open.spotify.com/track/discover-album-track-1",
            },
            {
              id: "discover-album-track-2",
              name: "Second Light",
              artists: "International Artist",
              albumName: "Discover 0",
              imageUrl: "/artwork/glass-hours.png",
              durationMs: 187000,
              explicit: false,
              spotifyUrl: "https://open.spotify.com/track/discover-album-track-2",
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await page
      .getByRole("button", { name: "Open Discover 0" })
      .first()
      .click();

    const dialog = page.getByRole("dialog", { name: "Discover 0" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2 songs")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Play First Light" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Play all" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close album" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("home omits artists while the library filters real artists", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const tracks = [
        {
          id: "artist-track-weeknd",
          source: "spotify",
          name: "Blinding Lights",
          artists: "The Weeknd",
          albumName: "After Hours",
          imageUrl: "/artwork/glass-hours.png",
          durationMs: 200000,
          url: "https://open.spotify.com/track/artist-track-weeknd",
        },
        {
          id: "artist-track-sza",
          source: "spotify",
          name: "Snooze",
          artists: "SZA",
          albumName: "SOS",
          imageUrl: "/artwork/paper-moons.png",
          durationMs: 210000,
          url: "https://open.spotify.com/track/artist-track-sza",
        },
      ];
      localStorage.setItem(
        "hermes.library.imported.v1",
        JSON.stringify({
          state: {
            playlists: [
              {
                id: "artist-set",
                source: "spotify",
                name: "Artist Set",
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
    await mockDiscover(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Let's dive in", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Artists", exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Artists \(/ }).click();
    await expect(
      page.getByRole("heading", { name: "Artists", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "The Weeknd", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "SZA", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Mira Vale", { exact: true }),
    ).toHaveCount(0);
  });

  test("uses a centered top taskbar with no sidebar", async ({ page }) => {
    await mockDiscover(page, { connected: false });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);

    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y).toBeLessThan(40);
    expect(box!.width).toBeGreaterThan(box!.height);
    expect(
      Math.abs(box!.x + box!.width / 2 - viewport!.width / 2),
    ).toBeLessThan(2);

    await nav.getByRole("link", { name: "Library" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("region", { name: "Library", exact: true }),
    ).toBeVisible();

    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("region", { name: "Library", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Open search" }).click();
    await expect(
      page.getByRole("dialog", { name: "Search Hermes" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("region", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Demo listener")).toHaveCount(0);
    await expect(page.getByText("Simulated")).toHaveCount(0);

    await nav.getByRole("button", { name: "Open profile" }).click();
    await expect(
      page.getByRole("region", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await nav.getByRole("link", { name: "Home", exact: true }).click();

    // Non-Home keeps the compact profile dropdown.
    await page.goto("/library");
    await nav.getByRole("button", { name: "Profile menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Library" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/");

    await page.route("**/api/auth/spotify/login**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Connecting…</body></html>",
      }),
    );
    await nav.getByRole("button", { name: "Open connection" }).click();
    const connectCard = page.getByRole("region", {
      name: "Connect",
      exact: true,
    });
    await expect(connectCard).toBeVisible();
    await connectCard
      .getByRole("link", { name: "Connect Spotify" })
      .click();
    await expect(page).toHaveURL(/\/api\/auth\/spotify\/login/);
  });

  test("makes the profile menu keyboard navigable", async ({ page }) => {
    await mockDiscover(page, { connected: false });
    await page.goto("/library");

    const trigger = page.getByRole("button", { name: "Profile menu" });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Open profile menu" });
    await expect(menu).toBeVisible();

    const library = page.getByRole("menuitem", { name: "Library" });
    const settings = page.getByRole("menuitem", { name: "Settings" });
    await expect(library).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(settings).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(library).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("returns Connect to the page it started from", async ({ page }) => {
    await mockDiscover(page, { connected: false });
    const loginUrls: string[] = [];
    await page.route("**/api/auth/spotify/login**", (route) => {
      loginUrls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Connecting…</body></html>",
      });
    });

    await page.goto("/library");
    await page.getByRole("button", { name: "Connect account" }).click();
    await page.waitForURL("**/api/auth/spotify/login**");
    expect(new URL(loginUrls[0]).searchParams.get("returnTo")).toBe(
      "/library",
    );

    await page.goto("/stats");
    await page.getByRole("button", { name: "Connect account" }).click();
    await page.waitForURL("**/api/auth/spotify/login**");
    expect(new URL(loginUrls[1]).searchParams.get("returnTo")).toBe("/stats");
  });

  test("applies settings controls, clearing and reset", async ({ page }) => {
    await mockDiscover(page, { connected: false });
    await page.goto("/settings");

    await page.getByRole("button", { name: "Large" }).click();
    await expect(
      page.getByRole("button", { name: "Large" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hermes.settings.v1"),
      ),
    ).toContain('"lyricsScale":"large"');

    await page.getByRole("switch", { name: "Reduce motion" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion",
      "reduced",
    );

    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(page.getByText("Listening history cleared")).toBeVisible();

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Reset Hermes data?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await dialog.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByText("Hermes data reset")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Normal" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute(
      "data-motion",
      "full",
    );
  });

  test("renders every primary route without console or page errors", async ({
    page,
  }) => {
    await mockDiscover(page, { connected: false });
    const errors: string[] = [];
    let route = "/";
    const isBraveHeadlessHydrationWarning = (text: string) =>
      text.includes("Minified React error #418");
    page.on("pageerror", (error) => {
      if (isBraveHeadlessHydrationWarning(error.message)) return;
      errors.push(`${route}: ${error.message}`);
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Brave headless occasionally reports a recoverable React #418 when a
      // full document is replaced. The route still renders; Chrome and the dev
      // build are clean. Keep the sweep focused on real errors.
      if (isBraveHeadlessHydrationWarning(message.text())) return;
      errors.push(`${route}: ${message.text()}`);
    });
    const settleHydration = async () => {
      await expect(page.locator("main")).toBeVisible();
      await page.waitForFunction(() => {
        const quality = document.documentElement.dataset.quality;
        return quality === "full" || quality === "lite";
      });
      await page.waitForTimeout(150);
    };

    await page.goto("/");
    await settleHydration();

    route = "/library";
    await page.goto("/library");
    await settleHydration();

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    route = "/stats";
    await nav.getByRole("link", { name: "Stats", exact: true }).click();
    await expect(page).toHaveURL(/\/stats/);
    await expect(
      page.getByRole("heading", { name: "Your Stats", exact: true }),
    ).toBeVisible();

    route = "/settings";
    await nav.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();

    route = "/search";
    await page.goto("/search");
    await settleHydration();

    expect(errors).toEqual([]);
  });

  test("slides a liquid selector between taskbar buttons", async ({ page }) => {
    await mockDiscover(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const indicator = page.getByTestId("nav-liquid-indicator");
    await expect(indicator).toHaveAttribute("data-active-key", "home");
    await expect
      .poll(async () => {
        const pill = await indicator.boundingBox();
        const item = await nav
          .getByRole("link", { name: "Home", exact: true })
          .boundingBox();
        return pill && item
          ? Math.abs(pill.x - item.x) < 1 &&
              Math.abs(pill.width - item.width) < 1
          : false;
      })
      .toBe(true);

    const homeX = (await indicator.boundingBox())!.x;
    const ready = await indicator.evaluate(
      (element) => element.dataset.ready,
    );
    expect(ready).toBe("true");
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toHaveAttribute("data-liquid-hot", "true");

    await nav.getByRole("link", { name: "Library" }).click();
    await expect(indicator).toHaveAttribute("data-active-key", "library");
    await expect
      .poll(async () => {
        const pill = await indicator.boundingBox();
        const item = await nav
          .getByRole("link", { name: "Library" })
          .boundingBox();
        return pill && item ? Math.abs(pill.x - item.x) < 1 : false;
      })
      .toBe(true);
    expect((await indicator.boundingBox())!.x).toBeGreaterThan(homeX);
    await expect(
      nav.getByRole("link", { name: "Library" }),
    ).toHaveAttribute("data-liquid-hot", "true");
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).not.toHaveAttribute("data-liquid-hot", "true");

    await nav.getByRole("button", { name: "Open search" }).click();
    await expect(indicator).toHaveAttribute("data-active-key", "search");
    await page.keyboard.press("Escape");
    await expect(indicator).toHaveAttribute("data-active-key", "library");
  });

  test("stretches the liquid selector across a far jump and lands once", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const indicator = page.getByTestId("nav-liquid-indicator");
    const profile = nav.getByRole("button", { name: "Open profile" });
    await expect
      .poll(async () => {
        const pill = await indicator.boundingBox();
        const home = await nav
          .getByRole("link", { name: "Home", exact: true })
          .boundingBox();
        return pill && home ? Math.abs(pill.x - home.x) < 1 : false;
      })
      .toBe(true);

    await page.evaluate(() => {
      const samples: Array<{
        t: number;
        width: number;
        trailOpacity: number;
        hot: string[];
      }> = [];
      (
        window as unknown as { __navSamples: typeof samples }
      ).__navSamples = samples;
      const start = performance.now();
      const tick = (now: number) => {
        const pill = document.querySelector<HTMLElement>(
          '[data-testid="nav-liquid-indicator"]',
        );
        const trail = document.querySelector<HTMLElement>(
          ".nav-liquid-trail",
        );
        if (pill && trail) {
          const rect = pill.getBoundingClientRect();
          samples.push({
            t: now - start,
            width: rect.width,
            trailOpacity: Number(getComputedStyle(trail).opacity),
            hot: Array.from(
              document.querySelectorAll<HTMLElement>("[data-liquid-hot]"),
            ).map((item) => item.getAttribute("data-nav-key") ?? ""),
          });
        }
        if (now - start < 900) window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });

    await profile.click();
    await page.waitForTimeout(700);

    const samples = await page.evaluate(
      () =>
        (
          window as unknown as {
            __navSamples: Array<{
              width: number;
              trailOpacity: number;
              hot: string[];
            }>;
          }
        ).__navSamples,
    );
    const itemWidth = (await profile.boundingBox())!.width;
    expect(samples.length).toBeGreaterThan(8);
    expect(Math.max(...samples.map((sample) => sample.width))).toBeGreaterThan(
      itemWidth + 10,
    );
    expect(
      Math.max(...samples.map((sample) => sample.trailOpacity)),
    ).toBeGreaterThan(0.1);
    expect(
      samples.some((sample) => sample.hot.length > 1),
    ).toBe(true);

    await expect(indicator).toHaveAttribute("data-active-key", "profile");
    await expect
      .poll(async () => {
        const pill = await indicator.boundingBox();
        const target = await profile.boundingBox();
        return pill && target
          ? Math.abs(pill.x - target.x) < 1 &&
              Math.abs(pill.width - target.width) < 1
          : false;
      })
      .toBe(true);
    await expect(profile).toHaveAttribute("data-liquid-hot", "true");
    await expect(
      nav.locator('[data-liquid-hot="true"]'),
    ).toHaveCount(1);
  });

  test("lands on the latest destination after rapid selections", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const indicator = page.getByTestId("nav-liquid-indicator");

    await nav.getByRole("link", { name: "Library" }).click();
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(indicator).toHaveAttribute("data-active-key", "settings");
    await expect
      .poll(async () => {
        const pill = await indicator.boundingBox();
        const item = await nav
          .getByRole("link", { name: "Settings" })
          .boundingBox();
        return pill && item
          ? Math.abs(pill.x - item.x) < 1 &&
              Math.abs(pill.width - item.width) < 1
          : false;
      })
      .toBe(true);
    await expect(
      nav.locator('[data-liquid-hot="true"]'),
    ).toHaveCount(1);
    await expect(
      nav.getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("data-liquid-hot", "true");
  });

  test("respects reduced motion without the liquid trail", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockDiscover(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const indicator = page.getByTestId("nav-liquid-indicator");
    const trail = page.locator(".nav-liquid-trail");
    await expect(trail).toBeHidden();

    await nav.getByRole("link", { name: "Library" }).click();
    await expect(indicator).toHaveAttribute("data-active-key", "library");
    const pill = await indicator.boundingBox();
    const target = await nav.getByRole("link", { name: "Library" }).boundingBox();
    expect(pill && target).toBeTruthy();
    expect(Math.abs(pill!.x - target!.x)).toBeLessThan(1);
    expect(Math.abs(pill!.width - target!.width)).toBeLessThan(1);
    await expect(
      nav.locator('[data-liquid-hot="true"]'),
    ).toHaveCount(1);
  });

  test("uses a lite effects profile for constrained browsers", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/?perf=lite");
    await expect(page.locator("html")).toHaveAttribute("data-quality", "lite");

    const effects = await page.evaluate(() => ({
      liminalFilter: getComputedStyle(
        document.querySelector(".liminal-door") as Element,
      ).filter,
      orbFilter: getComputedStyle(
        document.querySelector(".ambient-orb") as Element,
      ).filter,
      navBackdrop: getComputedStyle(
        document.querySelector(
          'nav[aria-label="Primary navigation"]',
        ) as Element,
      ).backdropFilter,
    }));
    expect(effects.liminalFilter).toBe("none");
    expect(effects.orbFilter).toBe("none");
    expect(effects.navBackdrop).toContain("blur(8px)");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await nav.getByRole("link", { name: "Library" }).click();
    await expect(
      page.getByRole("region", { name: "Library", exact: true }),
    ).toBeVisible();
  });

  test("canonicalizes localhost to the loopback IP", async ({ page }) => {
    await mockDiscover(page);
    await page.goto("/");
    const port = new URL(page.url()).port;
    await page.goto(`http://localhost:${port}/`);
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/`);
    await expect(
      page.getByRole("heading", { name: "Let's dive in", level: 1 }),
    ).toBeVisible();
  });

  test("floats taskbar sections over Home and submerges the previous card", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const homeCard = page.getByRole("heading", {
      name: "Let's dive in",
      level: 1,
    });
    const libraryCard = page.getByRole("region", {
      name: "Library",
      exact: true,
    });
    const settingsCard = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    const profileCard = page.getByRole("region", {
      name: "Profile",
      exact: true,
    });
    const connectCard = page.getByRole("region", {
      name: "Connect",
      exact: true,
    });

    await nav.getByRole("link", { name: "Library" }).click();
    await expect(libraryCard).toBeVisible();
    await expect(libraryCard).toHaveAttribute("data-layout", "full");
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(homeCard).toBeAttached();

    const stageBox = await libraryCard.boundingBox();
    const navBox = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(stageBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(stageBox!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);
    expect(stageBox!.x).toBeGreaterThan(0);
    expect(stageBox!.x + stageBox!.width).toBeLessThan(viewport!.width);

    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(settingsCard).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    const submerge = await page.waitForFunction(
      () => {
        const element = document.querySelector<HTMLElement>(
          '[data-section="library"][data-phase="submerging"]',
        );
        return element ? getComputedStyle(element).animationName : false;
      },
      null,
      { timeout: 2_000 },
    );
    expect(await submerge.jsonValue()).toContain("home-stage-card-submerge");
    await expect(libraryCard).toHaveCount(0);

    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(settingsCard).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(homeCard).toBeVisible();

    await nav.getByRole("button", { name: "Open profile" }).click();
    await expect(profileCard).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await profileCard.getByRole("button", { name: /^Library/ }).click();
    await expect(libraryCard).toBeVisible();
    await expect(profileCard).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);

    // Import keeps its dialog on top of the floating card instead of routing.
    await nav.getByRole("button", { name: "Import music" }).click();
    await expect(
      page.getByRole("dialog", { name: "Import to Hermes" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(libraryCard).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Import to Hermes" }),
    ).toHaveCount(0);
    await expect(libraryCard).toBeVisible();

    await nav.getByRole("button", { name: "Open connection" }).click();
    await expect(connectCard).toBeVisible();
    await expect(connectCard).toHaveAttribute("data-layout", "compact");
    await expect(page).toHaveURL(/\/$/);
    await expect(libraryCard).toHaveCount(0);

    const connectBox = await connectCard.boundingBox();
    expect(connectBox).not.toBeNull();
    expect(connectBox!.width).toBeLessThanOrEqual(721);
    expect(connectBox!.height).toBeLessThan(520);
    expect(connectBox!.height).toBeGreaterThan(180);

    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(connectCard).toHaveCount(0);
    await expect(homeCard).toBeVisible();

    // Re-pressing the active section closes its card.
    await nav.getByRole("link", { name: "Library" }).click();
    await expect(libraryCard).toBeVisible();
    await nav.getByRole("link", { name: "Library" }).click();
    await expect(libraryCard).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);

    // Off Home the taskbar still navigates to the real routes.
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("has no horizontal overflow and shows the onboarding card", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const nav = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await expect(nav).toBeVisible();
    const navFit = await nav.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const profile = element.querySelector<HTMLElement>(
        '[data-nav-key="profile"]',
      );
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        lastRight: profile?.getBoundingClientRect().right ?? null,
        viewport: window.innerWidth,
      };
    });
    expect(navFit.scrollWidth).toBeLessThanOrEqual(navFit.clientWidth + 1);
    expect(navFit.left).toBeGreaterThanOrEqual(0);
    expect(navFit.right).toBeLessThanOrEqual(navFit.viewport);
    expect(navFit.lastRight).not.toBeNull();
    expect(navFit.lastRight!).toBeLessThanOrEqual(navFit.viewport);

    await expect(
      page.getByRole("navigation", { name: "Mobile navigation" }),
    ).toHaveCount(0);
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Let's dive in", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Albums from your listening history" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open profile" }).click();
    await expect(page.getByRole("region", { name: "Profile" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open search" }).click();
    await expect(
      page.getByRole("dialog", { name: "Search Hermes" }),
    ).toBeVisible();
  });

  test("floats a taskbar card inside a phone viewport", async ({ page }) => {
    await mockDiscover(page);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const libraryCard = page.getByRole("region", {
      name: "Library",
      exact: true,
    });

    await nav.getByRole("link", { name: "Library" }).click();
    await expect(libraryCard).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    const cardBox = await libraryCard.boundingBox();
    const navBox = await nav.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(cardBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);
    expect(cardBox!.x).toBeGreaterThan(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThan(390);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(844);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("keeps the cover marquee moving on a touch viewport", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const scroller = page.getByRole("region", {
      name: "Albums from your listening history",
    });
    await expect(scroller).toBeVisible();
    const before = await scroller.evaluate((element) => element.scrollLeft);
    await expect
      .poll(
        async () => {
          const value = await scroller.evaluate(
            (element) => element.scrollLeft,
          );
          return Math.abs(value - before) > 4;
        },
        { timeout: 4_000 },
      )
      .toBe(true);
  });

  test("floats the Library card on a touch viewport without overflow", async ({
    page,
  }) => {
    await mockDiscover(page);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Library" })
      .click();
    const card = page.getByRole("region", {
      name: "Library",
      exact: true,
    });
    await expect(card).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your Library" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(
      card.getByRole("button", { name: "Close Library" }),
    ).toBeVisible();
  });
});

test.describe("mobile audit", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("keeps settings, search, stats and the reset dialog inside a phone viewport", async ({
    page,
  }) => {
    await mockDiscover(page, { connected: false });
    for (const route of ["/settings", "/search", "/stats"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }

    await page.goto("/settings");
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(page.getByText("Listening history cleared")).toBeVisible();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Reset Hermes data?",
    });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.goto("/search");
    await page
      .getByRole("textbox", { name: /Search songs/ })
      .fill("t");
    await expect(
      page.getByText("Type one more character to search."),
    ).toBeVisible();
  });
});

