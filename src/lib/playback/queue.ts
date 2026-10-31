import { shuffled } from "@/lib/utils";

export type RepeatMode = "off" | "all" | "one";

export interface QueueState {
  queueIds: string[];
  currentIndex: number;
  repeat: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
  shufflePos: number;
}

export interface QueueMove {
  index: number;
  shufflePos: number;
}

/** Shuffle order always starts on the current track. */
export function buildShuffleOrder(length: number, startIndex: number): number[] {
  const indexes = Array.from({ length }, (_, index) => index).filter(
    (index) => index !== startIndex,
  );
  return [startIndex, ...shuffled(indexes)];
}

/** Rebuilds shuffle order after the queue changes, keeping the current track. */
export function rebuildShuffle(state: QueueState): Pick<
  QueueState,
  "shuffleOrder" | "shufflePos"
> {
  if (!state.shuffle || state.queueIds.length === 0) {
    return { shuffleOrder: [], shufflePos: 0 };
  }
  return {
    shuffleOrder: buildShuffleOrder(state.queueIds.length, state.currentIndex),
    shufflePos: 0,
  };
}

/**
 * Resolves the next position.
 * `auto` is true when the track ended on its own — repeat-one only applies then,
 * matching how listeners expect manual skip to behave.
 */
export function resolveNext(state: QueueState, auto = false): QueueMove | null {
  const length = state.queueIds.length;
  if (length === 0) return null;

  if (auto && state.repeat === "one") {
    return { index: state.currentIndex, shufflePos: state.shufflePos };
  }

  if (state.shuffle && state.shuffleOrder.length === length) {
    if (state.shufflePos + 1 < state.shuffleOrder.length) {
      return {
        index: state.shuffleOrder[state.shufflePos + 1],
        shufflePos: state.shufflePos + 1,
      };
    }
    if (state.repeat === "all") {
      return { index: state.shuffleOrder[0], shufflePos: 0 };
    }
    return null;
  }

  if (state.currentIndex + 1 < length) {
    return { index: state.currentIndex + 1, shufflePos: state.shufflePos };
  }
  if (state.repeat === "all") {
    return { index: 0, shufflePos: 0 };
  }
  return null;
}

export function resolvePrevious(state: QueueState): QueueMove | null {
  const length = state.queueIds.length;
  if (length === 0) return null;

  if (state.shuffle && state.shuffleOrder.length === length) {
    if (state.shufflePos > 0) {
      return {
        index: state.shuffleOrder[state.shufflePos - 1],
        shufflePos: state.shufflePos - 1,
      };
    }
    if (state.repeat === "all") {
      return {
        index: state.shuffleOrder[length - 1],
        shufflePos: length - 1,
      };
    }
    return null;
  }

  if (state.currentIndex > 0) {
    return { index: state.currentIndex - 1, shufflePos: state.shufflePos };
  }
  if (state.repeat === "all") {
    return { index: length - 1, shufflePos: state.shufflePos };
  }
  return null;
}

export const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

export function cycleRepeat(mode: RepeatMode): RepeatMode {
  return REPEAT_ORDER[(REPEAT_ORDER.indexOf(mode) + 1) % REPEAT_ORDER.length];
}
