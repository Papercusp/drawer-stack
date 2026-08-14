// @papercusp/drawer-stack — generic cross-island coordinator for right-edge
// drawers that share one trigger stack and can coexist as side-by-side panes
// (newest opens leftmost), with a viewport-aware overlay fallback.

export { useDrawerStackItem } from './useDrawerStackItem';
export type { UseDrawerStackItemOptions, DrawerStackItem } from './useDrawerStackItem';
export { closeAll } from './store';
export type { ItemSnapshot } from './store';
export {
  computeLayout,
  EDGE_PX,
  GAP_PX,
  RESERVE_LEFT_PX,
  Z,
  type OpenPane,
  type PaneLayout,
  type StackLayout,
} from './layout';
