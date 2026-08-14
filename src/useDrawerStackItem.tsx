'use client';

// React binding for the drawer stack. Each drawer calls this once: it renders
// its floating trigger into the shared stack via `Trigger`, applies `paneStyle`
// to its Vaul/Radix Content, and reports its `open` + `width`. The library owns
// placement, the shared backdrop, Escape, and body scroll-lock — it does NOT
// reimplement the drawer panel.
//
//   const { Trigger, paneStyle, overlay, otherOpen } = useDrawerStackItem({
//     id: 'scout', priority: 10, open, onOpenChange: setOpen, width: '30rem',
//   });
//   // <Trigger>{yourButton}</Trigger>
//   // <Vaul.Content style={paneStyle}>…</Vaul.Content>

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_SNAPSHOT,
  ensureStack,
  getItemSnapshot,
  register,
  setOpen,
  setWidth,
  subscribe,
  unregister,
} from './store';

export interface UseDrawerStackItemOptions {
  /** Stable id for this drawer (e.g. 'scout', 'quick-quote', 'draft-quote'). */
  id: string;
  /** Trigger stack order, top→bottom (lower number = higher up the column). */
  priority: number;
  /** Whether this drawer's panel is currently open. */
  open: boolean;
  /** Called when the library asks this drawer to close (backdrop / Escape). */
  onOpenChange: (open: boolean) => void;
  /** The panel's width as a CSS length (used to size the coexist offsets). */
  width: string;
}

export interface DrawerStackItem {
  /** Renders its children as this drawer's floating trigger in the shared stack. */
  Trigger: (props: { children: ReactNode }) => ReactNode;
  /** Apply to the drawer's Vaul/Radix Content — sets `right` + `zIndex` so it
   *  docks alongside any other open panes. */
  paneStyle: CSSProperties;
  /** True when this pane is floating as a right-edge overlay (didn't fit). */
  overlay: boolean;
  /** True when any OTHER drawer is currently open (e.g. for "close & reveal" UI). */
  otherOpen: boolean;
}

export function useDrawerStackItem(opts: UseDrawerStackItemOptions): DrawerStackItem {
  const { id, priority, open, onOpenChange, width } = opts;

  // Keep the latest onOpenChange reachable from the stable onClose we register.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    register(id, { width, onClose: () => onOpenChangeRef.current(false) });
    return () => unregister(id);
    // Register once per id; width/open are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setWidth(id, width);
  }, [id, width]);

  useEffect(() => {
    setOpen(id, open);
  }, [id, open]);

  const snap = useSyncExternalStore(
    subscribe,
    () => getItemSnapshot(id),
    () => DEFAULT_SNAPSHOT,
  );

  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(ensureStack());
  }, []);

  const Trigger = useCallback(
    ({ children }: { children: ReactNode }) => {
      if (!container) return null;
      return createPortal(
        <div style={{ order: priority, pointerEvents: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          {children}
        </div>,
        container,
      );
    },
    [container, priority],
  );

  const paneStyle: CSSProperties = {
    right: snap.right || undefined,
    zIndex: snap.zIndex,
  };

  return { Trigger, paneStyle, overlay: snap.overlay, otherOpen: snap.otherOpen };
}
