# Nawy symbol - specification (artwork master)

Master box: 512 x 256 (two squares of side D = 256). phi = 1.6180339887.

- Dot: circle, centre (128, 128), radius 128 (D = 256).
- Slash: parallelogram with flat horizontal cuts,
  points (256, 256) (353.783, 256) (512, 0) (414.217, 0)
  - horizontal thickness t = D / phi^2 = 97.783
  - lean (offset) o = D / phi = 158.217  (31.7 deg from vertical)
  - foot starts at x = D (where the dot ends); top-right corner at x = 2D.
- Closest gap dot to slash: 0.188 D.
- Clear space: at least D / 2 on every side.
- Colours: Nawy Blue #3D7BFF, Deep #101A32, Ink #111318, White #FFFFFF.

App icon (1024 canvas): D = 300 (mark width 600), optical shift +25, -1 px.
Small-size drawing (16 / 32 / 48 px): D = 360. Maskable: same artwork, full-bleed tile, inside the safe zone.

Rules: never change the dot independently; no gradients, outlines or shadows; do not rotate the slash;
the wordmark goes beside the symbol (lockup), not after it on the same line (it reads "Nawyo/").
