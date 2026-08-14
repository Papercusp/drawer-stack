// Vanilla singleton store for the drawer stack.
//
// The drawers live in SEPARATE Astro islands (separate React roots), so a React
// context can't coordinate them — this module-level store does. It owns the
// shared DOM (one trigger-stack container + one dim backdrop), resolves each
// open pane's width to px, runs the pure `computeLayout`, and imperatively
// applies the result (stack slide/visibility, backdrop, body scroll-lock). React
// consumers read their own pane's placement via `useSyncExternalStore`.

import { computeLayout, Z, type OpenPane, type StackLayout } from './layout';

const STACK_ID = 'rf-fab-stack'; // shared with the legacy id so the shop's
// responsive compact-corner CSS (@media max-width:1500px #rf-fab-stack) keeps
// targeting it after this generalization.
const BACKDROP_ID = 'rf-drawer-backdrop';
const RIGHT_INSET = '0.75rem';
const STACK_GAP_PX = 12;

interface Item {
  id: string;
  width: string; // CSS length, e.g. 'var(--cart-drawer-width)' or 'min(30rem, ...)'
  open: boolean;
  seq: number;
  onClose: () => void;
}

export interface ItemSnapshot {
  /** Inline `right` (px) to apply to the open pane; '' when closed. */
  right: string;
  /** z-index for the open pane; undefined when closed. */
  zIndex: number | undefined;
  /** Whether this pane is floating as an overlay (didn't fit alongside). */
  overlay: boolean;
  /** Is any OTHER registered drawer currently open. */
  otherOpen: boolean;
}

export const DEFAULT_SNAPSHOT: ItemSnapshot = Object.freeze({
  right: '',
  zIndex: undefined,
  overlay: false,
  otherOpen: false,
});

const items = new Map<string, Item>();
let seqCounter = 0;
let snapshots = new Map<string, ItemSnapshot>();
let openCount = 0;
const listeners = new Set<() => void>();

let stackEl: HTMLElement | null = null;
let backdropEl: HTMLElement | null = null;
let listenersInstalled = false;
let resizeScheduled = false;
const widthCache = new Map<string, number>();

const isBrowser = (): boolean => typeof document !== 'undefined';

/** Resolve a CSS length (which may use vw/min/var) to px via a hidden probe.
 *  Cached; the cache is cleared on resize since viewport-relative lengths change. */
function resolvePx(css: string): number {
  const cached = widthCache.get(css);
  if (cached !== undefined) return cached;
  if (!isBrowser()) return 0;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;height:0;pointer-events:none;width:${css};`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  widthCache.set(css, px);
  return px;
}

function ensureDom(): void {
  if (!isBrowser()) return;

  // Re-resolve the shared elements on EVERY call (not gated by a one-shot flag):
  // Astro's ClientRouter soft-navigations swap <body> and drop our appended
  // nodes, while this module's state survives the swap. Re-querying + recreating
  // when missing keeps the stack/backdrop alive across navigation (the React
  // islands re-mount and re-read ensureStack() to get the live container).
  let s = document.getElementById(STACK_ID);
  if (!s) {
    s = document.createElement('div');
    s.id = STACK_ID;
    Object.assign(s.style, {
      position: 'fixed',
      top: '50%',
      right: RIGHT_INSET,
      transform: 'translate3d(0, -50%, 0)',
      transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: `${STACK_GAP_PX}px`,
      zIndex: String(Z.stack),
      pointerEvents: 'none', // children re-enable; an empty stack never blocks clicks
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(s);
  }
  stackEl = s;

  let b = document.getElementById(BACKDROP_ID);
  if (!b) {
    b = document.createElement('div');
    b.id = BACKDROP_ID;
    b.setAttribute('aria-hidden', 'true');
    Object.assign(b.style, {
      position: 'fixed',
      inset: '0',
      background: 'oklch(from var(--color-background, #0b0b0c) l c h / 0.72)',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 220ms ease',
      zIndex: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    b.addEventListener('pointerdown', () => {
      if (openCount > 0) closeAll();
    });
    document.body.appendChild(b);
  }
  backdropEl = b;

  // window survives soft-navs, so install these once.
  if (!listenersInstalled) {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize, { passive: true });
    listenersInstalled = true;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && openCount > 0) closeAll();
}

function onResize(): void {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    widthCache.clear(); // vw/min/var widths depend on the viewport
    recompute();
  });
}

function applyDom(layout: StackLayout): void {
  if (!isBrowser()) return;
  if (stackEl) {
    // The compact-corner CSS at <=1500px sets `transform: none !important`, so
    // this slide only takes effect on wide screens where panes coexist.
    stackEl.style.transform =
      layout.stackOffsetPx > 0
        ? `translate3d(-${layout.stackOffsetPx}px, -50%, 0)`
        : 'translate3d(0, -50%, 0)';
    stackEl.style.opacity = layout.stackHidden ? '0' : '1';
    stackEl.style.visibility = layout.stackHidden ? 'hidden' : 'visible';
  }
  if (backdropEl) {
    const show = layout.backdropZ > 0;
    backdropEl.style.zIndex = String(layout.backdropZ);
    backdropEl.style.opacity = show ? '1' : '0';
    backdropEl.style.pointerEvents = show ? 'auto' : 'none';
  }
  // The drawers run non-modal (so closed triggers stay clickable), so Vaul no
  // longer locks body scroll — own it here.
  document.body.style.overflow = layout.openCount > 0 ? 'hidden' : '';
}

function recompute(): void {
  ensureDom();
  const openItems: Item[] = [];
  for (const it of items.values()) if (it.open) openItems.push(it);
  openCount = openItems.length;

  const open: OpenPane[] = openItems.map((i) => ({
    id: i.id,
    seq: i.seq,
    widthPx: resolvePx(i.width),
  }));
  const vw = isBrowser() ? window.innerWidth : 0;
  const layout = computeLayout(open, vw);

  const next = new Map<string, ItemSnapshot>();
  for (const it of items.values()) {
    const p = layout.panes[it.id];
    next.set(it.id, {
      right: p ? `${p.rightPx}px` : '',
      zIndex: p ? p.zIndex : undefined,
      overlay: p ? p.overlay : false,
      otherOpen: openCount > (it.open ? 1 : 0),
    });
  }
  snapshots = next;

  applyDom(layout);
  for (const l of listeners) l();
}

/** Close every open drawer (fired from the backdrop + Escape). */
export function closeAll(): void {
  for (const it of [...items.values()]) if (it.open) it.onClose();
}

// ── Registry API (called by the React hook) ─────────────────────────────────

export function register(id: string, opts: { width: string; onClose: () => void }): void {
  const existing = items.get(id);
  if (existing) {
    existing.width = opts.width;
    existing.onClose = opts.onClose;
  } else {
    items.set(id, { id, width: opts.width, open: false, seq: 0, onClose: opts.onClose });
  }
  recompute();
}

export function unregister(id: string): void {
  if (items.delete(id)) recompute();
}

export function setOpen(id: string, open: boolean): void {
  const it = items.get(id);
  if (!it || it.open === open) return;
  if (open) it.seq = ++seqCounter; // newest-opened gets the highest seq
  it.open = open;
  recompute();
}

export function setWidth(id: string, width: string): void {
  const it = items.get(id);
  if (!it || it.width === width) return;
  it.width = width;
  recompute();
}

// ── Read API (for useSyncExternalStore) ──────────────────────────────────────

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getItemSnapshot(id: string): ItemSnapshot {
  return snapshots.get(id) ?? DEFAULT_SNAPSHOT;
}

/** Ensure the shared trigger-stack container exists and return it (for portals). */
export function ensureStack(): HTMLElement | null {
  ensureDom();
  return stackEl;
}
