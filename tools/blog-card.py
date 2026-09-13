"""
Quinta & Co. — blog title card builder
======================================

Builds the two images every blog post needs, in the house style:

    images/blog-<SLUG>.webp   1200x1200  — the header on the post + blog list
    images/og-<SLUG>.jpg      1200x630   — the link preview on LinkedIn/FB/IG

TO MAKE CARDS FOR A NEW POST
----------------------------
1. Drop the photo in  images/_originals/
2. Change the five settings in the POST block just below.
3. Run it:      py tools/blog-card.py
4. Look at both images. If the crop missed the subject, nudge FOCUS
   and run it again. FOCUS is "how far across / how far down" the
   thing you want centred sits in the original photo, 0 to 1.
   (0.5, 0.5) is dead centre. Lower the second number to move up.

Needs Pillow (py -m pip install pillow) and the Fraunces + Cinzel
fonts installed on this machine.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

# ===========================================================================
#  POST  — this is the only block you normally change
# ===========================================================================
SLUG     = "ai-slowdown"
PHOTO    = "blog-ai-slowdown-original.png"             # in images/_originals/
FOCUS    = (0.74, 0.33)                                # subject: across, down
HEADLINE = "Will AI End Humanity?"
SUBLINE  = "What the founders' warnings mean for small business owners."

# How many lines the headline may use. Fewer lines = bigger type. If the
# square card looks cramped, try 4; if it looks small, try 2.
SQUARE_HEADLINE_LINES    = 2
LANDSCAPE_HEADLINE_LINES = 2
# ===========================================================================


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Brand palette (see brand/quinta-and-co-brand-guidelines.pdf)
CREAM = (250, 250, 246)   # #FAFAF6
MOSS  = (61, 84, 74)      # #3D544A  headline + mark
SAGE  = (110, 139, 122)   # #6E8B7A  ornaments
LINE  = (200, 210, 203)   # hairline rules

S = 4  # supersample factor — everything is drawn 4x then shrunk. This is
       # the only antialiasing, so don't lower it.

# --- type scale, as a fraction of card WIDTH -------------------------------
# Deliberately keyed to width, not height. Keying to height makes every
# element on the short landscape card shrink to ~60% of the square's.
MARK   = 0.077    # sprout mark height
FOOT   = 0.0215   # Cinzel wordmark
SUB    = 0.0335   # italic subline, starting size
SUBMIN = 0.0260   # ...and the smallest it may shrink to
HEAD_SQUARE    = 0.079
HEAD_LANDSCAPE = 0.040


def _fonts():
    """Fraunces + Cinzel, wherever Windows put them."""
    roots = [os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts"),
             os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]
    want = ("Fraunces-Display.ttf", "Fraunces-Display-Italic.ttf", "Cinzel-Regular.ttf")
    found = []
    for name in want:
        for r in roots:
            p = os.path.join(r, name)
            if os.path.exists(p):
                found.append(p)
                break
        else:
            sys.exit("Font not found: %s\nInstall the brand fonts, then run this again." % name)
    return found


F_DISP, F_ITAL, F_CINZ = _fonts()


# ---------------------------------------------------------------------------
#  Text fitting
# ---------------------------------------------------------------------------
def greedy(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def balanced(draw, text, font, maxw):
    """Same number of lines, but as even as possible — the equivalent of
    CSS text-wrap: balance. Without this, fitting the biggest font that
    happens to fit leaves orphans like a lone 'Have a' on its own line."""
    base = greedy(draw, text, font, maxw)
    n = len(base)
    if n <= 1:
        return base
    lo, hi, best = 1, maxw, base
    while lo < hi:                     # narrowest width still giving n lines
        mid = (lo + hi) // 2
        ls = greedy(draw, text, font, mid)
        if len(ls) <= n and max(draw.textlength(l, font=font) for l in ls) <= maxw:
            best, hi = ls, mid
        else:
            lo = mid + 1
    return best


def fit(draw, text, path, maxw, start, maxlines, minsize):
    size = int(start)
    while size > minsize:
        f = ImageFont.truetype(path, size)
        ls = balanced(draw, text, f, maxw)
        if len(ls) <= maxlines and all(draw.textlength(l, font=f) <= maxw for l in ls):
            return f, ls
        size -= 2
    f = ImageFont.truetype(path, int(minsize))
    return f, balanced(draw, text, f, maxw)


# ---------------------------------------------------------------------------
#  The brand mark, transcribed from brand/mark-sprout.svg
#
#  Drawn from the SVG's own coordinates rather than rasterised: svglib parses
#  the file but reportlab's renderPM needs a cairo backend that isn't
#  installed here, and cairosvg isn't either. Don't redraw this by eye — if
#  the mark ever changes, copy the new path numbers in.
# ---------------------------------------------------------------------------
VB_W, VB_H, VB_STROKE = 18.0, 13.5, 0.5
STEM   = ((9, 8.5), (9, 13.5))                            # M9 8.5 V13.5
LEAF_L = (((9, 8.5), (6.5, 7.9), (2.8, 6), (1, 1.1)),     # C ... C ... Z
          ((1, 1.1), (4, 0), (7.8, 2.9), (9, 8.5)))
LEAF_R = (((9, 8.5), (11.5, 7.9), (15.2, 6), (17, 1.1)),
          ((17, 1.1), (14, 0), (10.2, 2.9), (9, 8.5)))
SEED   = ((9, 3.5), 0.8)
MARK_RATIO = VB_W / VB_H          # 1.333 — the mark is WIDER than it is tall


def _cubic(p0, p1, p2, p3, n=90):
    out = []
    for i in range(n + 1):
        t = i / float(n)
        m = 1 - t
        out.append((m**3 * p0[0] + 3*m*m*t * p1[0] + 3*m*t*t * p2[0] + t**3 * p3[0],
                    m**3 * p0[1] + 3*m*m*t * p1[1] + 3*m*t*t * p2[1] + t**3 * p3[1]))
    return out


def sprout(d, cx, cy, h, color):
    """Draw the mark centred on (cx, cy) with bounding-box height h."""
    s = h / VB_H
    ox, oy = cx - (VB_W * s) / 2.0, cy - h / 2.0
    T = lambda p: (ox + p[0] * s, oy + p[1] * s)
    sw = max(1, int(round(VB_STROKE * s)))
    r = sw / 2.0

    def cap(p):                                   # stroke-linecap="round"
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)

    a, b = T(STEM[0]), T(STEM[1])
    d.line([a, b], fill=color, width=sw)
    cap(a); cap(b)

    for leaf in (LEAF_L, LEAF_R):
        poly = []
        for seg in leaf:
            poly += _cubic(*[T(p) for p in seg])
        d.line(poly, fill=color, width=sw, joint="curve")
        cap(poly[0]); cap(poly[-1])
        cap(T(leaf[0][3]))                        # tip, where the curves meet

    c, rr = T(SEED[0]), SEED[1] * s
    d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=color)


# ---------------------------------------------------------------------------
#  The card
# ---------------------------------------------------------------------------
def build(out, W, H, head_frac, head_lines, panel, foot_y_frac, quality):
    w, h = W * S, H * S
    img = Image.new("RGB", (w, h), CREAM)

    # right-hand photo panel, cropped so FOCUS sits in the middle of it
    px0 = int(w * panel)
    pw, ph = w - px0, h
    src = os.path.join(REPO, "images", "_originals", PHOTO)
    if not os.path.exists(src):
        sys.exit("Photo not found:\n  %s\nPut it in images/_originals/ first." % src)
    photo = Image.open(src).convert("RGB")
    sc = max(pw / photo.width, ph / photo.height)
    nw, nh = int(photo.width * sc) + 1, int(photo.height * sc) + 1
    photo = photo.resize((nw, nh), Image.LANCZOS)
    left = max(0, min(nw - pw, int(FOCUS[0] * nw - pw / 2)))
    top  = max(0, min(nh - ph, int(FOCUS[1] * nh - ph / 2)))
    img.paste(photo.crop((left, top, left + pw, top + ph)), (px0, 0))

    d = ImageDraw.Draw(img)
    M = int(w * 0.067)                      # left margin
    maxw = px0 - M - int(w * 0.065)         # text column
    cxm = M + maxw // 2

    # sprout mark, top left, its left edge flush with the text margin
    mark_h = int(w * MARK)
    sprout(d, M + mark_h * MARK_RATIO / 2.0, int(h * 0.112), mark_h, MOSS)

    # everything below is measured UP from the wordmark
    cinz = ImageFont.truetype(F_CINZ, int(w * FOOT))
    foot_y = int(h * foot_y_frac)
    d.text((M, foot_y), "Q U I N T A   &   C O .   \u00b7   Q U I N T A A N D . C O",
           font=cinz, fill=MOSS)

    r2 = foot_y - int(w * 0.026)            # rule + diamond above the wordmark
    d.line([(M, r2), (M + maxw, r2)], fill=LINE, width=max(1, S // 2))
    dm = int(w * 0.005)
    d.polygon([(cxm, r2 - dm), (cxm + dm, r2), (cxm, r2 + dm), (cxm - dm, r2)], fill=SAGE)

    sf, slines = fit(d, SUBLINE, F_ITAL, maxw, w * SUB, 2, w * SUBMIN)
    sh = sf.size * 1.42
    sy = r2 - int(w * 0.024) - sh * len(slines)
    for i, l in enumerate(slines):
        d.text((M, sy + i * sh), l, font=sf, fill=MOSS)

    r1 = int(sy - w * 0.024)                # rule + sprout above the subline
    d.line([(M, r1), (M + maxw, r1)], fill=LINE, width=max(1, S // 2))
    orn_h = int(w * 0.026)
    gap_x = orn_h * MARK_RATIO / 2.0 + w * 0.008
    d.rectangle([cxm - gap_x, r1 - orn_h, cxm + gap_x, r1 + orn_h], fill=CREAM)
    sprout(d, cxm, r1, orn_h, SAGE)

    hf, hlines = fit(d, HEADLINE, F_DISP, maxw, w * head_frac, head_lines, w * 0.030)
    lh = hf.size * 1.13
    hy = r1 - int(w * 0.035) - lh * len(hlines)
    for i, l in enumerate(hlines):
        d.text((M, hy + i * lh), l, font=hf, fill=MOSS)

    img.resize((W, H), Image.LANCZOS).save(out, quality=quality)
    print("  %-36s %-9s  headline %dpx on %d lines   %d KB"
          % (os.path.basename(out), "%dx%d" % (W, H),
             hf.size // S, len(hlines), os.path.getsize(out) // 1024))


if __name__ == "__main__":
    print("Building title cards for '%s'" % SLUG)
    build(os.path.join(REPO, "images", "blog-%s.webp" % SLUG),
          1200, 1200, HEAD_SQUARE, SQUARE_HEADLINE_LINES,
          panel=0.583, foot_y_frac=0.795, quality=86)
    build(os.path.join(REPO, "images", "og-%s.jpg" % SLUG),
          1200, 630, HEAD_LANDSCAPE, LANDSCAPE_HEADLINE_LINES,
          panel=0.600, foot_y_frac=0.800, quality=84)
    print("Done. Open both and check the crop before you publish.")
