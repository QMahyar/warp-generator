# B7 — UX core: router, presets, Amnezia editor, a11y, mobile

Status: OPEN
Type: task (AFK)
Blocked by: B6

## Question / Work

1. Hash router (#/account/{id}, #/presets...) with pushState-free refresh/back safety; api() handles 401 → redirect /admin/login instead of raw SyntaxError toast; cancel/stale-guard rapid navigations.
2. Preset editing in place (reuse add form) + bulk endpoint paste textarea accepting `ip:port` per line (cf-scanner workflow).
3. Per-account Amnezia editor card in detail view: 9 fields prefilled from global defaults, override toggle, reset button, 2–3 named presets ("Mild", "Aggressive") + plain-language hints; wire to existing amnezia_overrides API.
4. A11y: account cards → real buttons/role=link+tabindex; confirm modal focuses Cancel (never destructive OK); focus trap ~20 lines in modals; role=dialog/aria-modal/labelledby; toasts role=status aria-live; contrast bump gray-600→500 on dark bg; setup eye toggles tabindex fix.
5. Mobile: nav/tap targets ≥44px, sub-row buttons spaced, token tap-to-reveal; skeleton re-flash only on slow loads (>400ms); spotlight handler disabled on touch.

## Acceptance

- Keyboard-only walk completes: login → open account → edit Amnezia → copy URL → delete-with-confirm.
- Browser QA agent pass at 390px + desktop, zero console errors.

## Answer

(resolved on close)
