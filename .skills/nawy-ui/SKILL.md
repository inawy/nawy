---
name: nawy-ui
description: Nawy UI rules: Arabic-first RTL/LTR, logical CSS, localization, design tokens, smooth bottom sheets and animations, accessibility. Use for any screen, component, style, animation or text change.
---

# Nawy UI

## Direction and language

- Arabic is the default (`dir="rtl"`, `lang="ar"`); English switches to LTR. Both must work everywhere.
- Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`) instead of left/right.
- Icons that imply direction (arrows, chevrons, back) flip in RTL. Numbers, dates and mixed text must render correctly in both directions.
- All user-facing strings live in one localization layer. No hard-coded strings in components.

## Design language

- Calm, simple, personal. One recognizable look, driven by design tokens (colors, spacing, radius, type scale, motion durations) defined in one place.
- Support light and dark via tokens, not per-component overrides.
- Shared components are extracted only when two or more screens genuinely need them, and must keep Nawy's personality.

## Brand identity (decisions 023, 120)

- Source of truth is `brand/` (spec in `brand/SPEC.md`, SVGs in `brand/svg/`). The shipped icons come from the master pack; `brand/make-derived-icons.py` redraws the monochrome icon and the notification badge from `svg/mark-ink.svg` and `svg/notification-badge.svg`.
- The mark is the noon grid: a 3x3 grid of sharp squares, a teal hero `#29CAC0` at top-centre and five lit squares (coral, sunny yellow, mint, calm blue, lavender) on the Ink tile `#111318`. The colour mark is for dark surfaces only; on light surfaces use the ink mark (the header does this in CSS).
- Never: gradients, outlines or shadows; recolouring or re-spacing single squares; rotating the grid. Keep at least one cell of clear space around the mark.
- Up to 48 px use the larger mark without ghost squares; maskable and round icons use a smaller centred mark. Do not replace them with a scaled copy of the 512 icon.
- The in-app accent follows the user's choice (blue by default); the brand mark no longer follows it.

## Motion

- Animate `transform` and `opacity` only. Avoid animating layout properties (height, top, margin).
- Start-up: the page is hidden by `html.booting` until the first `render()` has run (app.js removes the class; the boot script does after 3 s as a fail-safe). Never show the empty skeleton and then fill it; the installed-app splash is the OS's, built from the manifest, and cannot be removed (decision 035).
- Bottom sheets: mount the element once, keep it in the DOM, slide with `transform: translateY(...)`, set initial hidden state before first paint, and avoid toggling `display` during the transition. This prevents flicker.
- Use one set of easing and duration tokens. Honor `prefers-reduced-motion`.
- Existing animations are part of the product: do not change or remove them as a side effect of other work.

## Accessibility and touch

- Real buttons and inputs, visible focus states, sufficient contrast.
- Touch targets at least 44px. Bottom sheets and dialogs trap focus, close on Escape and back gesture, and restore focus.
- Safe-area insets respected on notched devices.

## Behavior to preserve

When changing UI, keep existing function names, structure, RTL behavior, animations and PWA behavior unless the task explicitly changes them. Make the smallest change that solves the problem.
- Menu: a side drawer below 1024px and a docked collapsible sidebar from 1024px (`#menuOverlay`, `isSidebarDocked()`, `html[data-sidebar]`). Screens opened from the menu go through `dismissMenuForNavigation()`; never close the docked sidebar from code that is not the user collapsing it (decision 041).
- Navigation buttons in menu screens use `.nav-bar` / `.nav-btn` (44px; back = chevron at the start, close = X at the end); never add a small floating close or an unlabeled chevron (decision 050).
