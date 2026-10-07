"""
Quinta & Co. — turn Cal.com bookings into enrollment rows
=========================================================

Reads your Cal.com bookings and writes the SQL to put them in the
enrollments table. You paste the result into the Supabase SQL editor.

It does NOT write to Supabase itself, on purpose. Writing would need a
service-role key kept on this machine, and enrollments hold customer names
and emails — not worth a powerful key sitting in a folder for a table you
touch a few times a week.

RUN IT
    py tools/enrollments-from-cal.py              last 90 days of bookings
    py tools/enrollments-from-cal.py --days 365   further back
    py tools/enrollments-from-cal.py --since 2026-09-01

A BUNDLE NEEDS A HAND. Cal.com sees a bundle as one booking for one class,
because that is all it can see. When the script meets one it says so and
writes all the rows the bundle entitles her to, not just the one she booked.

Reads the Cal.com key from docs/cal-api-key.txt, which is gitignored.
"""

import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"   # Cal.com 403s the default
USER = "quintaandco"

# Class names carry an em-dash; without this the Windows console turns it
# into a question mark and the SQL you paste has a broken name in it.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Not classes, so not entitlements: the paid 1:1 Open Studio sessions and the
# free coffee. They are one-off bookings with nothing owed afterwards.
NOT_A_CLASS = ("quinta-session", "coffee", "30-min-connect")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYFILE = os.path.join(REPO, "docs", "cal-api-key.txt")

# What each bundle entitles someone to. Keep in step with the BUNDLES block
# in fork-femme-foundations.html — this is the only other place it is written.
BUNDLES = {
    "the-practice-fff":   ("the-practice",   ["module-1", "module-2", "module-3"]),
    "build-to-last-fff":  ("build-to-last",  ["certification", "financial-planning",
                                              "trademarks", "brand-101"]),
    "keep-the-books-fff": ("keep-the-books", ["bookkeeping-1", "bookkeeping-2"]),
    "get-started-fff":    ("get-started",    ["entity-setup", "module-1"]),
}


def key():
    if not os.path.exists(KEYFILE):
        sys.exit("No Cal.com key at %s" % KEYFILE)
    return io.open(KEYFILE, encoding="utf-8").read().strip()


def get(url, ver="2024-06-14"):
    r = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key(), "cal-api-version": ver, "User-Agent": UA})
    return json.load(urllib.request.urlopen(r))


def q(v):
    """SQL literal. None -> NULL, everything else single-quoted and escaped."""
    if v is None or v == "":
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def class_names():
    """Read the real names out of classes.js so the ledger matches the site."""
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


def main():
    days = 90
    since = None
    if "--days" in sys.argv:
        try: days = int(sys.argv[sys.argv.index("--days") + 1])
        except (IndexError, ValueError): pass
    if "--since" in sys.argv:
        try: since = datetime.fromisoformat(sys.argv[sys.argv.index("--since") + 1]).replace(tzinfo=timezone.utc)
        except (IndexError, ValueError): pass
    if since is None:
        since = datetime.now(timezone.utc) - timedelta(days=days)

    ets = get("https://api.cal.com/v2/event-types?username=%s" % USER).get("data") or []
    if isinstance(ets, dict): ets = ets.get("eventTypes", [])
    by_id = {e["id"]: e for e in ets if e.get("id")}
    names = class_names()

    rows, skipped, bundles_seen = [], 0, 0
    page = 0
    while True:
        res = get("https://api.cal.com/v2/bookings?take=100&skip=%d" % (page * 100), "2024-08-13")
        got = res.get("data") or []
        if isinstance(got, dict): got = got.get("bookings", [])
        if not got:
            break
        for b in got:
            status = str(b.get("status", "")).lower()
            if status in ("cancelled", "canceled", "rejected"):
                skipped += 1
                continue
            created = b.get("createdAt") or b.get("start")
            if created:
                try:
                    if datetime.fromisoformat(created.replace("Z", "+00:00")) < since:
                        continue
                except ValueError:
                    pass
            et = by_id.get(b.get("eventTypeId")) or {}
            slug = et.get("slug")
            if not slug or any(slug.startswith(x) for x in NOT_A_CLASS):
                skipped += 1
                continue
            att = (b.get("attendees") or [{}])[0]
            email = att.get("email")
            if not email:
                skipped += 1
                continue
            name = att.get("name")
            uid = b.get("uid")
            price = et.get("price") or 0
            # referral code, if she typed one at booking
            ref = None
            for f in (b.get("bookingFieldsResponses") or {}).items():
                if f[0] == "ref":
                    ref = f[1] or None
            start = b.get("start")
            on = start[:10] if start else None
            taken = bool(start and datetime.fromisoformat(start.replace("Z", "+00:00")) < datetime.now(timezone.utc))

            if slug in BUNDLES:
                bundles_seen += 1
                bkey, classes = BUNDLES[slug]
                for i, cs in enumerate(classes):
                    rows.append(dict(name=name, email=email, slug=cs, cname=names.get(cs),
                                     source="bundle", bundle=bkey, amount=price if i == 0 else 0,
                                     uid=uid, ref=ref,
                                     # only the class she actually booked has a date
                                     status=("taken" if taken else "booked") if i == 0 else "owed",
                                     on=on if i == 0 else None))
            else:
                rows.append(dict(name=name, email=email, slug=slug, cname=names.get(slug),
                                 source="single", bundle=None, amount=price, uid=uid, ref=ref,
                                 status="taken" if taken else "booked", on=on))
        if len(got) < 100:
            break
        page += 1

    print()
    print("-- Quinta & Co. enrollments, generated %s" % datetime.now().strftime("%d %b %Y %H:%M"))
    print("-- %d row(s) from Cal.com bookings since %s. %d booking(s) skipped"
          % (len(rows), since.strftime("%d %b %Y"), skipped))
    if bundles_seen:
        print("-- %d bundle booking(s) expanded into every class they entitle." % bundles_seen)
    print("-- Safe to run twice: rows already imported are left alone.")
    print()
    if not rows:
        print("-- Nothing to import.")
        print()
        return

    print("insert into public.enrollments")
    print("  (student_name, student_email, class_slug, class_name, source, bundle_key,")
    print("   amount_cents, order_ref, ref_code, status, session_on)")
    print("values")
    out = []
    for r in rows:
        out.append("  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)" % (
            q(r["name"]), q(r["email"]), q(r["slug"]), q(r["cname"]), q(r["source"]),
            q(r["bundle"]), r["amount"] or 0, q(r["uid"]), q(r["ref"]), q(r["status"]), q(r["on"])))
    print(",\n".join(out))
    print("on conflict (order_ref, class_slug) where order_ref is not null do nothing;")
    print()


if __name__ == "__main__":
    main()
