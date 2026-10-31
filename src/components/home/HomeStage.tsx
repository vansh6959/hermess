"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore, type HomeSection } from "@/store/ui";
import { HomeConnectCard } from "./HomeConnectCard";
import { HomeProfileCard } from "./HomeProfileCard";

const SUBMERGE_MS = 620;
const SUBMERGE_CLEANUP_MS = SUBMERGE_MS + 60;

type StageSection = "library" | "settings" | "stats";

const STAGE_LOADERS: Record<StageSection, () => Promise<ComponentType>> = {
  library: () =>
    import("@/components/library/LibraryCard").then((module) => module.default),
  settings: () =>
    import("@/app/settings/page").then((module) => module.default),
  stats: () => import("@/app/stats/page").then((module) => module.default),
};

const loadedStages = new Map<StageSection, ComponentType>();
const pendingStages = new Map<StageSection, Promise<ComponentType>>();
const stageListeners = new Set<() => void>();
const STAGE_LABELS: Record<StageSection, string> = {
  library: "Library",
  settings: "Settings",
  stats: "Stats",
};
const STAGE_RELOAD_KEY = "hermes.stage-reload.v1";
const STAGE_RELOAD_WINDOW_MS = 15_000;

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return /loading chunk|dynamically imported module|failed to fetch/i.test(
    error.message,
  );
}

function recoverStaleStage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(STAGE_RELOAD_KEY) ?? 0);
    if (
      Number.isFinite(last) &&
      Date.now() - last < STAGE_RELOAD_WINDOW_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(STAGE_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function isStageSection(section: HomeSection): section is StageSection {
  return section === "library" || section === "settings" || section === "stats";
}

function loadStage(section: StageSection): Promise<ComponentType> {
  const loaded = loadedStages.get(section);
  if (loaded) return Promise.resolve(loaded);
  const pending = pendingStages.get(section);
  if (pending) return pending;

  const promise = STAGE_LOADERS[section]()
    .then((Component) => {
      loadedStages.set(section, Component);
      pendingStages.delete(section);
      for (const listener of stageListeners) listener();
      return Component;
    })
    .catch((error: unknown) => {
      pendingStages.delete(section);
      throw error;
    });
  pendingStages.set(section, promise);
  return promise;
}

export function preloadHomeSection(section: HomeSection): void {
  if (!isStageSection(section)) return;
  void loadStage(section).catch(() => undefined);
}

function LazyStage({ section }: { section: StageSection }) {
  const [Component, setComponent] = useState<ComponentType | null>(
    () => loadedStages.get(section) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      const next = loadedStages.get(section) ?? null;
      // Wrap the component in an updater so React stores the function
      // instead of invoking it as a state reducer.
      setComponent(() => next);
      if (next) setFailed(false);
    };
    stageListeners.add(sync);
    sync();
    if (!loadedStages.has(section)) {
      void loadStage(section)
        .then(() => {
          if (active) setFailed(false);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setFailed(true);
          if (isChunkLoadError(error)) recoverStaleStage();
        });
    }
    return () => {
      active = false;
      stageListeners.delete(sync);
    };
  }, [section]);

  if (Component) return <Component />;
  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <p className="text-[13px] text-white/70">
          Couldn&apos;t load {STAGE_LABELS[section]}.
        </p>
        <button
          type="button"
          className="btn h-9 px-4 text-[12px]"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
  return <StageLoading />;
}

function LibraryStage() {
  return <LazyStage section="library" />;
}

function SettingsStage() {
  return <LazyStage section="settings" />;
}

function StatsStage() {
  return <LazyStage section="stats" />;
}

function StageLoading() {
  return (
    <div className="space-y-6" aria-hidden data-testid="stage-loading">
      <div className="skeleton h-8 w-48 rounded-full" />
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton h-11 rounded-[15px]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton aspect-square rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}

const STAGE_SECTIONS: Record<
  HomeSection,
  { label: string; Content: ComponentType; layout: "full" | "compact" }
> = {
  library: {
    label: "Library",
    layout: "full",
    Content: LibraryStage,
  },
  settings: {
    label: "Settings",
    layout: "full",
    Content: SettingsStage,
  },
  stats: {
    label: "Stats",
    layout: "full",
    Content: StatsStage,
  },
  connect: {
    label: "Connect",
    layout: "compact",
    Content: HomeConnectCard,
  },
  profile: {
    label: "Profile",
    layout: "compact",
    Content: HomeProfileCard,
  },
};

interface StageEntry {
  id: number;
  section: HomeSection;
  phase: "active" | "submerging";
}

export function HomeStage() {
  const homeSection = useUiStore((state) => state.homeSection);
  const closeHomeSection = useUiStore((state) => state.closeHomeSection);
  const [entries, setEntries] = useState<StageEntry[]>([]);
  const currentSection = useRef<HomeSection | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const nextId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (homeSection === currentSection.current) return;
    const previousSection = currentSection.current;
    currentSection.current = homeSection;
    nextId.current += 1;

    if (homeSection && !previousSection) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !stageRef.current?.contains(active)) {
        returnFocusRef.current = active;
      }
    }
    if (!homeSection && previousSection && returnFocusRef.current) {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      target.focus?.();
    }

    if (!homeSection) {
      setEntries((previous) =>
        previous.map((entry) =>
          entry.phase === "active"
            ? { ...entry, phase: "submerging" as const }
            : entry,
        ),
      );
      return;
    }

    setEntries((previous) => [
      ...previous.map((entry) =>
        entry.phase === "active"
          ? { ...entry, phase: "submerging" as const }
          : entry,
      ),
      { id: nextId.current, section: homeSection, phase: "active" },
    ]);
  }, [homeSection]);

  useEffect(() => {
    if (!entries.some((entry) => entry.phase === "submerging")) return;
    const timer = window.setTimeout(() => {
      setEntries((previous) =>
        previous.filter((entry) => entry.phase !== "submerging"),
      );
    }, SUBMERGE_CLEANUP_MS);
    return () => window.clearTimeout(timer);
  }, [entries]);

  useEffect(() => {
    const warm = () => {
      preloadHomeSection("stats");
      preloadHomeSection("settings");
      preloadHomeSection("library");
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 1_500 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(warm, 300);
    return () => window.clearTimeout(timer);
  }, []);

  const activeId =
    entries.find((entry) => entry.phase === "active")?.id ?? null;

  useEffect(() => {
    if (activeId === null) return;
    stageRef.current
      ?.querySelector<HTMLElement>('[data-phase="active"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.title = "Hermes — music in glass";
    };
  }, [activeId]);

  // Leaving Home drops the floating cards instead of resurrecting them later.
  useEffect(() => {
    return () => {
      useUiStore.getState().closeHomeSection();
    };
  }, []);

  const open = entries.length > 0;

  return (
    <>
      <div
        aria-hidden
        onClick={open ? closeHomeSection : undefined}
        className={cn(
          "home-stage-veil fixed inset-0 z-[44] transition-opacity duration-500 ease-out",
          open
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[45] px-3 pb-4 pt-[4.5rem] transition-opacity duration-300 sm:px-6 sm:pb-6 sm:pt-[5.25rem]",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          ref={stageRef}
          className={cn(
            "relative mx-auto h-full w-full max-w-[1180px]",
            open && "pointer-events-auto",
          )}
          style={{ perspective: "1600px" }}
        >
          {entries.map((entry) => {
            const { label, Content, layout } = STAGE_SECTIONS[entry.section];
            const compact = layout === "compact";

            return (
              <section
                key={entry.id}
                data-phase={entry.phase}
                data-section={entry.section}
                data-layout={layout}
                aria-label={label}
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.defaultPrevented) return;
                  if (
                    event.target instanceof Element &&
                    event.target.closest('[role="dialog"]')
                  ) {
                    return;
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    closeHomeSection();
                  }
                }}
                className={cn(
                  "home-stage-card liquid rim grain absolute flex flex-col overflow-hidden text-left shadow-[0_60px_160px_-50px_rgba(0,0,0,0.98)] outline-none",
                  compact
                    ? "inset-x-0 top-0 mx-auto h-auto max-h-full w-full max-w-[720px] rounded-[24px]"
                    : "inset-0 rounded-[28px]",
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(12,17,16,0.58),rgba(3,5,5,0.9))]"
                />
                <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-3.5 sm:px-7">
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.28em] text-[var(--text-mute)]">
                    {label}
                  </p>
                  <button
                    type="button"
                    onClick={closeHomeSection}
                    aria-label={`Close ${label}`}
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-black/25 text-white/45 transition-[color,border-color,background-color] duration-200 hover:border-white/20 hover:bg-white/[0.05] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)]"
                  >
                    <X size={13} />
                  </button>
                </div>

                <div
                  className={cn(
                    "relative z-10 min-h-0 overflow-y-auto overscroll-contain",
                    compact
                      ? "flex-1 px-5 pb-5 pt-2 sm:px-7 sm:pb-6"
                      : "flex-1 px-5 pb-10 pt-3 sm:px-7",
                  )}
                >
                  <Content />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
