// Pure geometry for the drawer stack — no DOM, no React, fully unit-testable.
//
// Panes dock from the right edge, NEWEST opening to the LEFT of the existing
// ones (most-recently-opened nearest the centre, matching today's
// Scout-opens-left-of-cart). Each pane's right offset is the sum of the widths
// (+ gaps) of the panes to its right. When the cumulative group would exceed the
// viewport, the newest pane(s) that don't fit float as a right-edge overlay
// above a lifted backdrop instead of docking.

/** A registered drawer that is currently OPEN, with its resolved pixel width. */
export interface OpenPane {
  id: string;
  /** Resolved rendered width in CSS pixels. */
  widthPx: number;
  /** Monotonic open-sequence — higher = opened more recently. */
  seq: number;
}

export interface PaneLayout {
  /** Distance (px) from the viewport's right edge to this pane's right edge. */
  rightPx: number;
  /** z-index for this pane. */
  zIndex: number;
  /** True when the pane could not fit alongside the others and floats on top. */
  overlay: boolean;
}

export interface StackLayout {
  /** Per-open-pane placement, keyed by id. Closed/unknown ids are absent. */
  panes: Record<string, PaneLayout>;
  /** How far left (px, >= 0) to translate the trigger stack so it sits just
   *  left of the whole docked group. 0 when nothing is docked-open. */
  stackOffsetPx: number;
  /** Hide the trigger stack entirely (it would be covered by an overlay pane). */
  stackHidden: boolean;
  /** z-index for the shared dim backdrop. 0 means render no backdrop. */
  backdropZ: number;
  /** Number of open panes. */
  openCount: number;
  /** Whether any pane is in overlay mode. */
  hasOverlay: boolean;
}

// Layout constants (px). EDGE = gap from the viewport right edge to the first
// pane; GAP = gutter between adjacent panes; RESERVE_LEFT = the minimum sliver
// of page kept clear on the left so a docked group never reaches the far edge
// (also leaves room for the trigger column to its left).
export const EDGE_PX = 12;
export const GAP_PX = 12;
export const RESERVE_LEFT_PX = 24;

// z-index bands. In coexist mode the backdrop sits below the docked panes but
// above the trigger stack (so closed triggers stay clickable to open alongside).
// In overlay mode the backdrop is lifted above the docked panes to dim them too,
// and the overlay pane floats above that.
export const Z = {
  stack: 67,
  coexistBackdrop: 66,
  paneBase: 68,
  overlayBase: 90,
} as const;

const EMPTY: StackLayout = {
  panes: {},
  stackOffsetPx: 0,
  stackHidden: false,
  backdropZ: 0,
  openCount: 0,
  hasOverlay: false,
};

/**
 * Compute side-by-side placement for a set of open drawers.
 *
 * Pure: depends only on its inputs. `viewportPx` is `window.innerWidth`.
 */
export function computeLayout(open: OpenPane[], viewportPx: number): StackLayout {
  if (open.length === 0) return { ...EMPTY };

  // Oldest first → rightmost; newest last → leftmost.
  const ordered = [...open].sort((a, b) => a.seq - b.seq);

  const panes: Record<string, PaneLayout> = {};
  let cursor = EDGE_PX; // right offset for the next docked pane
  let overlayMode = false;
  let dockedCount = 0;
  let maxDockedZ = Z.paneBase - 1;
  let overlayIdx = 0;

  ordered.forEach((pane, i) => {
    if (!overlayMode) {
      const rightPx = cursor;
      const fits = rightPx + pane.widthPx + RESERVE_LEFT_PX <= viewportPx;
      // The first pane always docks — a lone drawer is never an "overlay", even
      // when it's wider than the viewport (a near-full-width mobile drawer).
      if (dockedCount === 0 || fits) {
        const zIndex = Z.paneBase + i;
        panes[pane.id] = { rightPx, zIndex, overlay: false };
        maxDockedZ = zIndex;
        cursor = rightPx + pane.widthPx + GAP_PX;
        dockedCount += 1;
        return;
      }
      overlayMode = true;
    }
    // Overlay: float at the right edge, stacked above the docked panes (newest
    // overlay on top).
    panes[pane.id] = { rightPx: EDGE_PX, zIndex: Z.overlayBase + overlayIdx, overlay: true };
    overlayIdx += 1;
  });

  const hasOverlay = overlayIdx > 0;
  // The docked group's left edge (distance from the right) = cursor - trailing GAP.
  const stackOffsetPx = dockedCount > 0 ? cursor - GAP_PX : 0;

  return {
    panes,
    stackOffsetPx,
    stackHidden: hasOverlay,
    backdropZ: hasOverlay ? maxDockedZ + 1 : Z.coexistBackdrop,
    openCount: open.length,
    hasOverlay,
  };
}
