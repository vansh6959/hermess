"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSpotifySession } from "@/components/providers/SpotifyPlaybackProvider";
import {
  snapshotListeningStats,
  subscribeListeningStats,
} from "@/lib/spotify/stats";
import {
  fetchAccountListeningStats,
  publishAccountStats,
  pushListeningStats,
} from "@/lib/spotify/stats-sync";

export function StatsSyncRuntime() {
  const { session, sessionStatus } = useSpotifySession();
  const connected = sessionStatus === "ready" && session?.connected === true;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const debounceRef = useRef<number | null>(null);

  const request = useCallback(
    (kind: "push" | "refresh", keepalive = false) => {
      if (!connectedRef.current) return Promise.resolve();
      const task = chainRef.current.then(async () => {
        if (!connectedRef.current) return;
        const merged =
          kind === "push"
            ? await pushListeningStats(snapshotListeningStats(), { keepalive })
            : await fetchAccountListeningStats();
        publishAccountStats({
          stats: merged,
          phase: "ready",
        });
      });
      chainRef.current = task.catch(() => undefined);
      return task;
    },
    [],
  );

  const pushNow = useCallback(
    (keepalive = false) => request("push", keepalive),
    [request],
  );

  useEffect(() => {
    if (sessionStatus !== "ready") return;
    if (!connected) {
      publishAccountStats({ stats: null, phase: "ready" });
      return;
    }
    publishAccountStats({ phase: "syncing" });
    void pushNow();
  }, [connected, pushNow, sessionStatus]);

  useEffect(() => {
    const schedule = () => {
      if (!connectedRef.current) return;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void pushNow();
      }, 900);
    };
    const unsubscribe = subscribeListeningStats(schedule);
    return () => {
      unsubscribe();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [pushNow]);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void request("refresh");
      }
    }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void request("refresh");
      } else {
        void pushNow(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, pushNow, request]);

  return null;
}
