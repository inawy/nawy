# Nawy identity - specification (general identity: the noon grid)

Master tile T = 512. phi = 1.6180339887. Source SVGs are in `brand/svg/`.

## The mark

- A 3x3 grid of sharp-cornered squares with no gaps. The grid is "noon": one hero dot at top-centre plus five lit squares along the stroke; three neutral ghost squares (white 10%) sit left, right and below the dot.
- Mark width = T / phi = 316.4 (cell 105.5). Margins top : bottom = 1 : phi. Tile corner radius = T / phi^3.
- Order along the stroke (left, base-left, base-mid, base-right, right): coral, sunny yellow, mint, calm blue, lavender. One teal only: the hero.

## Colours

| Role | Hex |
|---|---|
| Hero (sea teal) | `#29CAC0` |
| Coral | `#FDB0AD` |
| Sunny yellow | `#FCDB81` |
| Mint | `#9EE0AF` |
| Calm blue | `#87B1E6` |
| Lavender | `#D4BAF4` |
| Tile (Ink) | `#111318` |

About 60 degrees between hue families; lightness alternates so neighbours separate (dE 11-17).

## Files

- `svg/app-icon.svg` (grid with ghosts on the tile), `svg/app-icon-square.svg` (full-bleed square), `svg/app-icon-small-optical.svg` (<= 48 px: larger mark, 0.80 T, no ghosts).
- `svg/mark-color.svg` (for dark surfaces only), `svg/mark-white.svg`, `svg/mark-ink.svg` (black), `svg/notification-badge.svg` (solid white cells, no tile).
- Optical sizing: up to 48 px use the larger mark without ghost squares. Maskable and round icons use a smaller centred mark.
- Monochrome and badge: solid cells, no colour.

## Rules

- No gradients, outlines or shadows; do not recolour individual squares; do not rotate or re-space the grid.
- `mark-color` only on dark surfaces; on light surfaces use `mark-ink`.
- Clear space: at least one cell (T / 5) on every side.

## Shipped files (repo root)

`icon-192.png`, `icon-512.png`, `maskable-icon.png`, `apple-touch-icon.png` (180), `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon.svg` come from the master pack. `monochrome-icon.png` and `notification-badge.png` are drawn by `brand/make-derived-icons.py` from `svg/mark-ink.svg` and `svg/notification-badge.svg`.
