"use client";

import { useEffect, useState } from "react";
import { useSpotifySession } from "@/components/providers/SpotifyPlaybackProvider";
import {
  snapshotListeningStats,
  subscribeListeningStats,
  type ListeningStats,
} from "@/lib/spotify/stats";
import {
  getAccountStatsSnapshot,
  subscribeAccountStats,
  type AccountStatsSnapshot,
} from "@/lib/spotify/stats-sync";

export type ListeningStatsSource = "account" | "device";

export function useListeningStats(): {
  stats: ListeningStats;
  ready: boolean;
  source: ListeningStatsSource;
} {
  const { session, sessionStatus } = useSpotifySession();
  const [local, setLocal] = useState<ListeningStats>(() =>
    snapshotListeningStats(),
  );
  const [localReady, setLocalReady] = useState(false);
  const [account, setAccount] = useState<AccountStatsSnapshot>(
    getAccountStatsSnapshot,
  );

  useEffect(() => {
    const sync = () => {
      setLocal(snapshotListeningStats());
      setLocalReady(true);
    };
    sync();
    return subscribeListeningStats(sync);
  }, []);

  useEffect(
    () => subscribeAccountStats(() => setAccount(getAccountStatsSnapshot())),
    [],
  );

  const accountRequired = sessionStatus === "ready" && session?.connected === true;
  const accountStats = accountRequired ? account.stats : null;
  const hasLocalStats = local.startedAt !== null;
  return {
    stats: accountStats ?? local,
    ready:
      localReady &&
      (!accountRequired || account.phase === "ready" || hasLocalStats),
    source: accountStats ? "account" : "device",
  };
}
