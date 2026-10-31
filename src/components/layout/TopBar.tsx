"use client";

import { useLayoutEffect, useRef, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartNoAxesColumn,
  Download,
  Home,
  Library,
  PlugZap,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { useUiStore, type HomeSection } from "@/store/ui";
import { useScrolled } from "@/hooks/useScroll";
import { cn } from "@/lib/utils";
import {
  advanceSpring,
  isItemTinted,
  liquidEnergy,
  liquidStretch,
  NAV_SPRINGS,
  springSettled,
} from "@/lib/nav-liquid";
import { Logo } from "@/components/common/Logo";
import { preloadHomeSection } from "@/components/home/HomeStage";
import { LiquidDropdown } from "@/components/ui/LiquidDropdown";

const itemClass =
  "taskbar-item group/item relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-[var(--text-mute)] outline-none transition-[background-color,color,box-shadow] duration-300 hover:bg-white/[0.045] hover:text-white/90 focus-visible:bg-white/[0.05] focus-visible:text-white/90 max-[340px]:h-9 max-[340px]:w-9";

type NavKey =
  | "home"
  | "library"
  | "stats"
  | "search"
  | "import"
  | "connect"
  | "settings"
  | "profile";

interface NavItemGeometry {
  center: number;
  top: number;
  width: number;
  height: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.motion === "reduced" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const setImportOpen = useUiStore((state) => state.setImportOpen);
  const searchOpen = useUiStore((state) => state.isSearchOpen);
  const importOpen = useUiStore((state) => state.isImportOpen);
  const homeSection = useUiStore((state) => state.homeSection);
  const openHomeSection = useUiStore((state) => state.openHomeSection);
  const closeHomeSection = useUiStore((state) => state.closeHomeSection);
  const scrolled = useScrolled(8);
  const { session, sessionStatus } = useSpotifyPlayback();

  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const trailRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Partial<Record<NavKey, HTMLElement | null>>>({});
  const motionRef = useRef({
    positioned: false,
    x: 0,
    vx: 0,
    trailX: 0,
    trailVx: 0,
    lastTime: 0,
    hot: new Set<NavKey>(),
  });

  const connected = Boolean(session?.connected);
  const connectAttention =
    sessionStatus === "ready" && Boolean(session?.configured) && !connected;
  const onHome = pathname === "/";
  const searchActive = pathname.startsWith("/search");
  const homeActive = onHome && homeSection === null;
  const libraryActive =
    (onHome && homeSection === "library") ||
    pathname.startsWith("/library") ||
    pathname.startsWith("/liked") ||
    pathname.startsWith("/recent") ||
    pathname.startsWith("/albums") ||
    pathname.startsWith("/artists") ||
    pathname.startsWith("/playlist/");
  const settingsActive =
    (onHome && homeSection === "settings") || pathname.startsWith("/settings");
  const statsActive =
    (onHome && homeSection === "stats") || pathname.startsWith("/stats");
  const connectActive = onHome && homeSection === "connect";
  const profileActive = onHome && homeSection === "profile";

  const activeNav: NavKey | null = importOpen
    ? "import"
    : searchOpen || searchActive
      ? "search"
      : homeActive
        ? "home"
        : libraryActive
          ? "library"
          : statsActive
            ? "stats"
            : settingsActive
              ? "settings"
              : connectActive
                ? "connect"
                : profileActive
                  ? "profile"
                  : null;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    const trail = trailRef.current;
    if (!nav || !pill || !trail) return;

    const motion = motionRef.current;
    let geometries = new Map<NavKey, NavItemGeometry>();
    let target: NavItemGeometry | null = null;
    let frame = 0;
    let visible = false;

    const measure = () => {
      const navRect = nav.getBoundingClientRect();
      const next = new Map<NavKey, NavItemGeometry>();
      for (const key of Object.keys(itemRefs.current) as NavKey[]) {
        const item = itemRefs.current[key];
        if (!item) continue;
        const rect = item.getBoundingClientRect();
        const left =
          rect.left - navRect.left - nav.clientLeft + nav.scrollLeft;
        const top =
          rect.top - navRect.top - nav.clientTop + nav.scrollTop;
        next.set(key, {
          center: left + rect.width / 2,
          top,
          width: rect.width,
          height: rect.height,
        });
      }
      return next;
    };

    const writeHot = (hot: Set<NavKey>) => {
      if (
        hot.size === motion.hot.size &&
        Array.from(hot).every((key) => motion.hot.has(key))
      ) {
        return;
      }
      for (const key of Object.keys(itemRefs.current) as NavKey[]) {
        const element = itemRefs.current[key];
        if (!element) continue;
        if (hot.has(key)) {
          element.setAttribute("data-liquid-hot", "true");
        } else {
          element.removeAttribute("data-liquid-hot");
        }
      }
      motion.hot = hot;
    };

    const paint = (energy: number, trailEnergy: number, moving: boolean) => {
      if (!target) return;
      const stretch = liquidStretch(motion.vx, target.center - motion.x);
      const width = target.width + stretch;
      const height = target.height + energy * 3;
      const left = motion.x - width / 2;
      const top = target.top - energy * 1.5;

      pill.style.width = `${width}px`;
      pill.style.height = `${height}px`;
      pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      pill.style.setProperty("--liquid-energy", energy.toFixed(3));
      pill.dataset.visible = visible ? "true" : "false";

      const trailWidth = target.width + 12 + stretch * 0.7;
      const trailHeight = target.height + 8;
      const trailLeft = motion.trailX - trailWidth / 2;
      trail.style.width = `${trailWidth}px`;
      trail.style.height = `${trailHeight}px`;
      trail.style.transform = `translate3d(${trailLeft}px, ${target.top - 4}px, 0)`;
      trail.style.opacity = `${Math.min(
        0.42,
        Math.max(energy, trailEnergy) * 0.42,
      )}`;
      trail.dataset.visible = moving ? "true" : "false";

      const hot = new Set<NavKey>();
      if (activeNav) {
        if (moving) {
          for (const [key, geometry] of geometries) {
            if (isItemTinted(geometry.center, motion.x, width)) {
              hot.add(key);
            }
          }
        } else {
          hot.add(activeNav);
        }
      }
      writeHot(hot);
    };

    const settle = () => {
      if (!target) return;
      visible = true;
      motion.positioned = true;
      motion.x = target.center;
      motion.vx = 0;
      motion.trailX = target.center;
      motion.trailVx = 0;
      paint(0, 0, false);
      trail.style.opacity = "0";
      trail.dataset.visible = "false";
      pill.dataset.ready = "true";
      trail.dataset.ready = "true";
    };

    const hide = () => {
      visible = false;
      motion.positioned = false;
      cancelAnimationFrame(frame);
      frame = 0;
      writeHot(new Set());
      pill.dataset.visible = "false";
      trail.dataset.visible = "false";
      trail.style.opacity = "0";
    };

    const tick = (now: number) => {
      frame = 0;
      if (!target || !visible) return;
      if (prefersReducedMotion()) {
        settle();
        return;
      }
      const dt = Math.min(34, Math.max(1, now - motion.lastTime));
      motion.lastTime = now;

      const main = advanceSpring(
        { value: motion.x, velocity: motion.vx },
        target.center,
        dt,
        NAV_SPRINGS.indicator,
      );
      motion.x = main.value;
      motion.vx = main.velocity;

      const trailSpring = advanceSpring(
        { value: motion.trailX, velocity: motion.trailVx },
        target.center,
        dt,
        NAV_SPRINGS.trail,
      );
      motion.trailX = trailSpring.value;
      motion.trailVx = trailSpring.velocity;

      if (
        springSettled(main, target.center) &&
        springSettled(trailSpring, target.center, 0.6, 8)
      ) {
        settle();
        return;
      }

      paint(
        liquidEnergy(main.velocity),
        liquidEnergy(trailSpring.velocity),
        true,
      );
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame || !target) return;
      motion.lastTime = performance.now();
      frame = window.requestAnimationFrame(tick);
    };

    const reposition = (snapIfIdle: boolean) => {
      geometries = measure();
      const next = activeNav ? geometries.get(activeNav) ?? null : null;
      if (!next) {
        target = null;
        hide();
        return;
      }

      const wasIdle = frame === 0;
      target = next;
      if (!motion.positioned || prefersReducedMotion()) {
        settle();
        return;
      }
      if (snapIfIdle && wasIdle) {
        settle();
        return;
      }

      visible = true;
      pill.dataset.visible = "true";
      trail.dataset.visible = "true";
      start();
    };

    const observer = new ResizeObserver(() => reposition(true));
    observer.observe(nav);
    for (const item of Object.values(itemRefs.current)) {
      if (item) observer.observe(item);
    }
    const onResize = () => reposition(true);
    window.addEventListener("resize", onResize);
    reposition(false);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [activeNav, pathname]);

  // On Home the taskbar surfaces float their section as a card instead of
  // leaving the page. Every other route keeps normal navigation.
  const floatSection = (section: HomeSection) => (event: MouseEvent) => {
    if (!onHome) return;
    event.preventDefault();
    if (homeSection === section) {
      closeHomeSection();
      return;
    }
    openHomeSection(section);
  };

  const warmSection = (section: HomeSection) => ({
    onPointerEnter: () => preloadHomeSection(section),
    onFocus: () => preloadHomeSection(section),
  });

  const toggleCompactSection = (section: HomeSection) => () => {
    if (homeSection === section) {
      closeHomeSection();
      return;
    }
    openHomeSection(section);
  };

  const goHome = (event: MouseEvent) => {
    if (!onHome) return;
    event.preventDefault();
    closeHomeSection();
  };

  const connect = () => {
    if (onHome) {
      toggleCompactSection("connect")();
      return;
    }
    if (connected) {
      if (pathname === "/settings") {
        const panel = document.getElementById("settings-connections");
        panel?.scrollIntoView({ behavior: "smooth", block: "center" });
        panel?.focus({ preventScroll: true });
        return;
      }
      router.push("/settings");
      return;
    }
    const returnTo = /^\/(?:search|settings|library|stats)?$/.test(pathname)
      ? pathname
      : "/search";
    window.location.assign(
      `/api/auth/spotify/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-1.5 sm:top-4 sm:px-3">
      <nav
        ref={navRef}
        aria-label="Primary navigation"
        data-scrolled={scrolled}
        className={cn(
          "rim pointer-events-auto relative z-10 flex max-w-full items-center gap-0 overflow-x-auto overflow-y-hidden rounded-[20px] border border-white/[0.055] bg-[rgba(5,8,8,0.68)] p-1 shadow-[0_18px_50px_-34px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-500 ease-spring no-scrollbar sm:gap-0.5 sm:p-1.5",
          scrolled &&
            "border-white/[0.09] bg-[rgba(4,7,7,0.86)] shadow-[0_28px_70px_-32px_rgba(0,0,0,0.98)]",
        )}
      >
        <span
          ref={trailRef}
          aria-hidden
          className="nav-liquid-trail"
        />
        <span
          ref={pillRef}
          aria-hidden
          data-active-key={activeNav ?? undefined}
          data-testid="nav-liquid-indicator"
          className="nav-liquid-indicator"
        />
        <span className="hidden h-10 w-10 shrink-0 place-items-center min-[390px]:grid">
          <Logo collapsed onClick={goHome} />
        </span>

        <span
          className="mx-0.5 hidden h-6 w-px shrink-0 bg-white/[0.07] sm:block"
          aria-hidden
        />

        <Link
          ref={(node) => {
            itemRefs.current.home = node;
          }}
          href="/"
          onClick={goHome}
          data-nav-key="home"
          aria-current={homeActive ? "page" : undefined}
          aria-label="Home"
          className={itemClass}
        >
          <Home size={17} className="shrink-0" />
        </Link>

        <Link
          ref={(node) => {
            itemRefs.current.library = node;
          }}
          href="/library"
          onClick={floatSection("library")}
          {...warmSection("library")}
          data-nav-key="library"
          aria-current={libraryActive ? "page" : undefined}
          aria-label="Library"
          className={itemClass}
        >
          <Library size={17} className="shrink-0" />
        </Link>

        <Link
          ref={(node) => {
            itemRefs.current.stats = node;
          }}
          href="/stats"
          onClick={floatSection("stats")}
          {...warmSection("stats")}
          data-nav-key="stats"
          aria-current={statsActive ? "page" : undefined}
          aria-label="Stats"
          className={itemClass}
        >
          <ChartNoAxesColumn size={17} className="shrink-0" />
        </Link>

        <button
          ref={(node) => {
            itemRefs.current.search = node;
          }}
          type="button"
          data-nav-key="search"
          onClick={() => setSearchOpen(true)}
          aria-label="Open search"
          className={itemClass}
        >
          <Search size={17} className="shrink-0" />
        </button>

        <button
          ref={(node) => {
            itemRefs.current.import = node;
          }}
          type="button"
          data-nav-key="import"
          onClick={() => {
            setSearchOpen(false);
            setImportOpen(true);
          }}
          aria-label="Import music"
          className={itemClass}
        >
          <Download size={17} className="shrink-0" />
        </button>

        <button
          ref={(node) => {
            itemRefs.current.connect = node;
          }}
          type="button"
          data-nav-key="connect"
          data-attention={connectAttention || undefined}
          onClick={connect}
          aria-label={
            onHome
              ? "Open connection"
              : connected
                ? pathname === "/settings"
                  ? "Account connected — go to connections"
                  : "Account connected — open settings"
                : "Connect account"
          }
          className={cn(
            itemClass,
            connected && "text-[var(--acid)] hover:text-[var(--acid)]",
            connectAttention && "nav-connect-attention",
          )}
        >
          <span className="relative shrink-0">
            <PlugZap size={17} />
            {connected && (
              <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--acid)] shadow-[0_0_8px_rgba(191,227,205,0.8)]" />
            )}
          </span>
        </button>

        <Link
          ref={(node) => {
            itemRefs.current.settings = node;
          }}
          href="/settings"
          onClick={floatSection("settings")}
          {...warmSection("settings")}
          data-nav-key="settings"
          aria-current={settingsActive ? "page" : undefined}
          aria-label="Settings"
          className={itemClass}
        >
          <Settings size={17} className="shrink-0" />
        </Link>

        {onHome ? (
          <button
            ref={(node) => {
              itemRefs.current.profile = node;
            }}
            type="button"
            data-nav-key="profile"
            onClick={toggleCompactSection("profile")}
            aria-label="Open profile"
            className={itemClass}
          >
            <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(150deg,#8ea69a,#3a4943_58%,#101512)] text-[12px] font-semibold text-white shadow-inner">
              <UserRound size={14} />
              {connected && (
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#070b09] bg-[var(--acid)] opacity-75" />
              )}
            </span>
          </button>
        ) : (
          <LiquidDropdown
            label="Open profile menu"
            trigger={
              <button
                type="button"
                aria-label="Profile menu"
                className={itemClass}
              >
                <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(150deg,#8ea69a,#3a4943_58%,#101512)] text-[12px] font-semibold text-white shadow-inner">
                  <UserRound size={14} />
                  {connected && (
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[#070b09] bg-[var(--acid)] opacity-75" />
                  )}
                </span>
              </button>
            }
            items={[
              {
                label: "Library",
                icon: <Library size={13} />,
                onSelect: () => router.push("/library"),
              },
              {
                label: "Settings",
                icon: <Settings size={13} />,
                onSelect: () => router.push("/settings"),
                separatorBefore: true,
              },
            ]}
          />
        )}
      </nav>
    </header>
  );
}
