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

## Motion

- Animate `transform` and `opacity` only. Avoid animating layout properties (height, top, margin).
- Bottom sheets: mount the element once, keep it in the DOM, slide with `transform: translateY(...)`, set initial hidden state before first paint, and avoid toggling `display` during the transition. This prevents flicker.
- Use one set of easing and duration tokens. Honor `prefers-reduced-motion`.
- Existing animations are part of the product: do not change or remove them as a side effect of other work.

## Accessibility and touch

- Real buttons and inputs, visible focus states, sufficient contrast.
- Touch targets at least 44px. Bottom sheets and dialogs trap focus, close on Escape and back gesture, and restore focus.
- Safe-area insets respected on notched devices.

## Behavior to preserve

When changing UI, keep existing function names, structure, RTL behavior, animations and PWA behavior unless the task explicitly changes them. Make the smallest change that solves the problem.
