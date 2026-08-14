# @papercusp/drawer-stack

Generic cross-island coordinator for right-edge drawers that share one trigger
stack and can coexist as side-by-side panes (newest opens leftmost), with a
viewport-aware overlay fallback. Vanilla store + a thin React hook. Owns
placement, the shared backdrop, ESC + scroll-lock; it does NOT reimplement the
drawer panel (Vaul/Radix stay in the consumer).

Consumed as a git submodule at `libs/drawer-stack` by Restart (shop.buyrestart.com)
and SideStage. Promoted from Restart's in-repo lib 2026-08-14
(plan sidestage/shared-cart-scout-drawer-libs-2026-08-14, P-001).

## Test

Run from a consumer workspace root (needs `@papercusp/test-config`):

    npm run test -w @papercusp/drawer-stack
