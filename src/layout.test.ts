import { describe, it, expect } from 'vitest';
import { computeLayout, EDGE_PX, GAP_PX, Z, type OpenPane } from './layout';

const pane = (id: string, seq: number, widthPx: number): OpenPane => ({ id, seq, widthPx });

describe('computeLayout', () => {
  it('returns an empty layout when nothing is open', () => {
    const l = computeLayout([], 1280);
    expect(l.openCount).toBe(0);
    expect(l.panes).toEqual({});
    expect(l.stackOffsetPx).toBe(0);
    expect(l.backdropZ).toBe(0);
    expect(l.hasOverlay).toBe(false);
    expect(l.stackHidden).toBe(false);
  });

  it('docks a single pane at the right edge and slides the stack past it', () => {
    const l = computeLayout([pane('a', 1, 400)], 1280);
    expect(l.panes.a).toEqual({ rightPx: EDGE_PX, zIndex: Z.paneBase, overlay: false });
    // stack sits just left of the lone pane: EDGE + width.
    expect(l.stackOffsetPx).toBe(EDGE_PX + 400);
    expect(l.backdropZ).toBe(Z.coexistBackdrop);
    expect(l.hasOverlay).toBe(false);
    expect(l.openCount).toBe(1);
  });

  it('docks a lone pane even when it is wider than the viewport (mobile)', () => {
    const l = computeLayout([pane('a', 1, 380)], 390);
    expect(l.panes.a.overlay).toBe(false);
    expect(l.panes.a.rightPx).toBe(EDGE_PX);
    expect(l.hasOverlay).toBe(false);
  });

  it('stacks newest to the LEFT of older panes, offset by the sum of widths to the right', () => {
    // a opened first (rightmost), b opened second (leftmost).
    const l = computeLayout([pane('a', 1, 400), pane('b', 2, 480)], 1280);
    expect(l.panes.a.rightPx).toBe(EDGE_PX); // 12
    expect(l.panes.b.rightPx).toBe(EDGE_PX + 400 + GAP_PX); // 12 + 400 + 12 = 424
    // newest (b) sits above older (a) in z.
    expect(l.panes.b.zIndex).toBeGreaterThan(l.panes.a.zIndex);
    expect(l.hasOverlay).toBe(false);
    // stack slides past BOTH panes.
    expect(l.stackOffsetPx).toBe(EDGE_PX + 400 + GAP_PX + 480); // 904
    expect(l.backdropZ).toBe(Z.coexistBackdrop);
  });

  it('ignores input order — placement is driven by open-sequence', () => {
    const byInputOrder = computeLayout([pane('b', 2, 480), pane('a', 1, 400)], 1280);
    const bySeqOrder = computeLayout([pane('a', 1, 400), pane('b', 2, 480)], 1280);
    expect(byInputOrder.panes).toEqual(bySeqOrder.panes);
  });

  it('docks all three panes side-by-side when the viewport is wide enough', () => {
    const l = computeLayout([pane('a', 1, 400), pane('b', 2, 400), pane('c', 3, 480)], 1600);
    expect(l.hasOverlay).toBe(false);
    expect(l.panes.a.rightPx).toBe(12);
    expect(l.panes.b.rightPx).toBe(12 + 400 + 12); // 424
    expect(l.panes.c.rightPx).toBe(12 + 400 + 12 + 400 + 12); // 836
    expect(l.panes.c.overlay).toBe(false);
    expect(l.stackHidden).toBe(false);
  });

  it('overlays the newest pane that does not fit, lifting the backdrop above the docked panes', () => {
    const l = computeLayout([pane('a', 1, 400), pane('b', 2, 400), pane('c', 3, 480)], 1280);
    // a + b dock; c overflows (836 + 480 + 24 = 1340 > 1280) → overlay.
    expect(l.panes.a.overlay).toBe(false);
    expect(l.panes.b.overlay).toBe(false);
    expect(l.panes.c.overlay).toBe(true);
    expect(l.panes.c.rightPx).toBe(EDGE_PX);
    expect(l.panes.c.zIndex).toBe(Z.overlayBase);
    expect(l.hasOverlay).toBe(true);
    expect(l.stackHidden).toBe(true);
    // backdrop lifted above the highest docked pane (b), below the overlay (c).
    expect(l.backdropZ).toBe(l.panes.b.zIndex + 1);
    expect(l.panes.c.zIndex).toBeGreaterThan(l.backdropZ);
  });

  it('overlays the 2nd pane on a narrow viewport (two full-width drawers cannot coexist)', () => {
    const l = computeLayout([pane('cart', 1, 380), pane('scout', 2, 380)], 420);
    expect(l.panes.cart.overlay).toBe(false);
    expect(l.panes.scout.overlay).toBe(true);
    expect(l.hasOverlay).toBe(true);
  });
});
