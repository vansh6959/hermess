"use client";

import { useEffect, useRef } from "react";

const RELOAD_KEY = "hermes:stale-build-reload";

function isStaleBuildError(error: Error): boolean {
  const message = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reloadAttempted = useRef(false);

  useEffect(() => {
    console.error("Hermes route error", error);
    if (!isStaleBuildError(error) || reloadAttempted.current) return;
    reloadAttempted.current = true;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    } catch {
      // If storage is blocked, keep the manual retry path.
    }
  }, [error]);

  const retry = () => {
    if (isStaleBuildError(error)) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="liquid rim grain max-w-lg rounded-[28px] px-8 py-12 text-center">
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Something went wrong
        </h1>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={retry} className="btn btn-accent">
            Try again
          </button>
          <a href="/" className="btn">
            Back home
          </a>
        </div>
      </div>
    </div>
  );
}
