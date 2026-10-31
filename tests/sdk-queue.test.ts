import { describe, expect, it } from "vitest";
import { nextQueueFromSdk } from "@/lib/spotify/sdk-queue";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

function track(
  id: string,
  overrides: Partial<SpotifyNowPlaying> = {},
): SpotifyNowPlaying {
  return {
    id,
    name: id,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    durationMs: 180000,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
    ...overrides,
  };
}

function sdkTrack(id: string) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: id,
    artists: [{ name: "SDK Artist" }],
    album: { name: "SDK Album", images: [{ url: `/${id}.jpg` }] },
  };
}

describe("SDK queue reconciliation", () => {
  it("maps the SDK order exactly", () => {
    const current = track("current");
    const queue = nextQueueFromSdk({
      current,
      sdkNext: [sdkTrack("a"), sdkTrack("b")],
    });
    expect(queue.map((item) => item.id)).toEqual(["current", "a", "b"]);
  });

  it("does not invent local ghosts when the SDK order diverges", () => {
    const current = track("current");
    const queue = nextQueueFromSdk({
      current,
      sdkNext: [sdkTrack("a"), sdkTrack("outside")],
    });
    expect(queue.map((item) => item.id)).toEqual([
      "current",
      "a",
      "outside",
    ]);
  });

  it("keeps known durations and fills missing metadata", () => {
    const current = track("current");
    const queue = nextQueueFromSdk({
      current,
      sdkNext: [{ id: "a", name: "A", uri: "spotify:track:a" }],
      knownTracks: new Map([["a", track("a", { durationMs: 99000 })]]),
    });
    expect(queue[1]).toMatchObject({
      id: "a",
      name: "A",
      artists: "Artist",
      albumName: "Album",
      durationMs: 99000,
    });
  });

  it("handles an empty SDK queue and episode URLs", () => {
    const current = track("current");
    expect(
      nextQueueFromSdk({ current, sdkNext: [] }),
    ).toEqual([current]);

    const episode = nextQueueFromSdk({
      current,
      sdkNext: [
        {
          id: "episode-1",
          uri: "spotify:episode:episode-1",
          name: "Episode",
          show: { name: "Show", images: [{ url: "/show.jpg" }] },
        },
      ],
    });
    expect(episode[1]).toMatchObject({
      id: "episode-1",
      albumName: "Show",
      artists: "Show",
      spotifyUrl: "https://open.spotify.com/episode/episode-1",
      uri: "spotify:episode:episode-1",
    });
  });
});
