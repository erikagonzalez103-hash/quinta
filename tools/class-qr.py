"""
Quinta & Co. — sign-in QR codes, one per class session
======================================================

Makes a printable card for every upcoming class: the class name, the date,
and a QR code that signs students in when they scan it.

    py tools/class-qr.py                 every upcoming session
    py tools/class-qr.py --days 30       only the next 30 days
    py tools/class-qr.py --slug module-1 one class only

Cards land in  qr-cards/  (gitignored — they are generated, not source).
Print them, or open one on a laptop at the front of the room.

HOW THE CODE KNOWS WHICH CLASS
Each row in class_sessions already has a session_id uuid. It is unguessable,
so it needs no secret of its own — the QR points at

    https://quintaand.co/here/?s=<session_id>

One code per session, not per class. Module 1 on 13 October and Module 1 on
27 October get different codes, which is what makes the date on the
attendance record true.
"""

import io
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import segno
except ImportError:
    sys.exit("Needs the segno library:  py -m pip install segno")

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "qr-cards")
BASE = "https://quintaand.co/here/?s="

SUPABASE = "https://pmpaslevwimofohirves.supabase.co"
ANON = "sb_publishable_t7U8S0paeslz99Y600_ixA_PHauIQcf"
TOKENFILE = os.path.join(REPO, "docs", "schedule-sync-token.txt")

CREAM = (250, 250, 246)
MOSS = (61, 84, 74)
SAGE = (110, 139, 122)
INK = (43, 58, 51)

FONTS = [os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts"),
         os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]


def font(name, size):
    for r in FONTS:
        p = os.path.join(r, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sync_token():
    """The schedule-sync token, which is what reads class_sessions."""
    if os.path.exists(TOKENFILE):
        return io.open(TOKENFILE, encoding="utf-8").read().strip()
    tok = os.environ.get("QUINTA_SYNC_TOKEN", "").strip()
    if tok:
        return tok
    sys.exit(
        "Need the schedule-sync token to read the class list.\n"
        "Put it in %s (that folder is gitignored), or set QUINTA_SYNC_TOKEN." % TOKENFILE)


def sessions():
    body = json.dumps({"sync_token": sync_token()}).encode()
    r = urllib.request.Request(SUPABASE + "/rest/v1/rpc/schedule_sync_read", data=body,
                               headers={"apikey": ANON, "Authorization": "Bearer " + ANON,
                                        "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r)) or []


def class_names():
    out = {}
    try:
        s = io.open(os.path.join(REPO, "classes.js"), encoding="utf-8").read()
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
        for m in re.finditer(r'slug:\s*"([\w-]+)"(.*?)\n  \}', s, re.S):
            n = re.search(r'name:\s*"([^"]+)"', m.group(2))
            if n:
                out[m.group(1)] = n.group(1)
    except Exception:
        pass
    return out


def pretty(iso, t):
    d = datetime.strptime(iso, "%Y-%m-%d")
    hh, mm = int(str(t)[:2]), int(str(t)[3:5])
    h = hh % 12 or 12
    return "%s %d %s  ·  %d:%02d%s" % (d.strftime("%A"), d.day, d.strftime("%B"),
                                       h, mm, "am" if hh < 12 else "pm")


def wrap(draw, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= maxw:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


def card(path, title, when, url):
    W, H = 1050, 1500              # 3.5 x 5 inches at 300dpi
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    M = 90

    f_eyebrow = font("Cinzel-Regular.ttf", 26)
    f_title = font("Fraunces-Display.ttf", 74)
    f_when = font("Cinzel-Regular.ttf", 30)
    f_step = font("Fraunces-Regular.ttf", 34)
    f_foot = font("Cinzel-Regular.ttf", 23)

    y = M
    d.text((M, y), "S I G N   I N", font=f_eyebrow, fill=SAGE); y += 58

    for line in wrap(d, title, f_title, W - M * 2)[:3]:
        d.text((M, y), line, font=f_title, fill=MOSS); y += 84
    y += 8
    d.text((M, y), when, font=f_when, fill=SAGE); y += 62

    d.line([(M, y), (W - M, y)], fill=(200, 210, 203), width=2); y += 54

    qr = segno.make(url, error="h")
    tmp = path + ".qr.png"
    qr.save(tmp, scale=14, border=2, dark="#3D544A", light="#FAFAF6")
    q = Image.open(tmp).convert("RGB")
    side = W - M * 2
    q = q.resize((side, side), Image.LANCZOS)
    img.paste(q, (M, y)); y += side + 46
    os.remove(tmp)

    d.text((M, y), "Scan with your phone camera.", font=f_step, fill=INK); y += 46
    d.text((M, y), "Type your name. That's it.", font=f_step, fill=INK)

    d.text((M, H - M - 26), "Q U I N T A   &   C O .", font=f_foot, fill=SAGE)
    img.save(path, quality=95)


def main():
    days = None
    slug_only = None
    if "--days" in sys.argv:
        try: days = int(sys.argv[sys.argv.index("--days") + 1])
        except (IndexError, ValueError): pass
    if "--slug" in sys.argv:
        try: slug_only = sys.argv[sys.argv.index("--slug") + 1]
        except IndexError: pass

    names = class_names()
    today = date.today()
    rows = []
    for s in sessions():
        try:
            d0 = datetime.strptime(s["session_date"], "%Y-%m-%d").date()
        except Exception:
            continue
        if d0 < today:
            continue
        if days is not None and (d0 - today).days > days:
            continue
        if slug_only and s.get("class_slug") != slug_only:
            continue
        rows.append(s)

    if not rows:
        print("  No upcoming sessions match.")
        return

    os.makedirs(OUT, exist_ok=True)
    rows.sort(key=lambda r: (r["session_date"], str(r["start_time"])))
    print()
    print("  %d card(s) -> %s" % (len(rows), OUT))
    print()
    for s in rows:
        slug = s["class_slug"]
        title = names.get(slug) or s.get("class_name") or slug
        when = pretty(s["session_date"], s["start_time"])
        url = BASE + s["session_id"]
        fn = "%s_%s_%s.png" % (s["session_date"], str(s["start_time"])[:5].replace(":", ""), slug)
        card(os.path.join(OUT, fn), title, when, url)
        print("   %s" % fn)
        print("      %s" % url)
    print()
    print("  Print them, or open one on a laptop at the front of the room.")
    print()


if __name__ == "__main__":
    main()
