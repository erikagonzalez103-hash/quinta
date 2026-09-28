"""
Quinta & Co. — class capacity check
===================================

Answers one question: is any class date about to go over ten people?

Every class seats 10. A bundle is a second door into the same room — someone
who buys The Practice sits in Module 1 alongside everyone who bought Module 1
on its own. Cal.com counts seats per event type, so those two doors do not
share a pool of ten, and a busy date could in principle seat more than ten.

This adds both doors together per date and tells you.

RUN IT
    py tools/class-capacity.py

    py tools/class-capacity.py --all     also list dates with nobody booked
    py tools/class-capacity.py --days 90 look further ahead (default 120)

Reads the Cal.com key from docs/cal-api-key.txt, which is gitignored.
"""

import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

ROOM = 10                      # seats in a class, the promise on the site
WARN_AT = 8                    # start showing amber at this many

# Not classes, so not part of the ten-seat promise: the 1:1 Open Studio
# sessions and the free coffee both have rolling availability and would
# bury the real rows under hundreds of empty slots.
NOT_A_CLASS = ("quinta-session", "coffee", "30-min-connect")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"   # Cal.com 403s the default

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYFILE = os.path.join(REPO, "docs", "cal-api-key.txt")
USER = "quintaandco"


def key():
    if not os.path.exists(KEYFILE):
        sys.exit("No Cal.com key at %s\nPut the API key in that file and run again." % KEYFILE)
    return io.open(KEYFILE, encoding="utf-8").read().strip()


def get(url, ver="2024-06-14"):
    r = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key(), "cal-api-version": ver, "User-Agent": UA})
    return json.load(urllib.request.urlopen(r))


def central(iso):
    """Cal.com talks UTC; Dallas reads Central. CDT until 1 Nov 2026, CST after."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    off = -5 if dt < datetime(2026, 11, 1, 7, tzinfo=timezone.utc) else -6
    return dt + timedelta(hours=off), ("CDT" if off == -5 else "CST")


def fmt(dt):
    h = dt.hour % 12 or 12
    return "%s %2d %s  %2d:%02d%s" % (dt.strftime("%a"), dt.day, dt.strftime("%b"),
                                      h, dt.minute, "am" if dt.hour < 12 else "pm")


def main():
    show_all = "--all" in sys.argv
    days = 120
    if "--days" in sys.argv:
        try: days = int(sys.argv[sys.argv.index("--days") + 1])
        except (IndexError, ValueError): pass

    ets = get("https://api.cal.com/v2/event-types?username=%s" % USER).get("data") or []
    if isinstance(ets, dict): ets = ets.get("eventTypes", [])
    by_id = {e["id"]: e for e in ets if e.get("id")}

    # A bundle twin shares its anchor class's schedule — that is how it inherits
    # dates, and it is also how we know which room it fills.
    anchor = {}
    for e in ets:
        slug = e.get("slug") or ""
        if not slug.endswith("-fff"):
            continue
        for other in ets:
            o = other.get("slug") or ""
            if o and not o.endswith("-fff") and other.get("scheduleId") == e.get("scheduleId"):
                anchor[slug] = o
                break

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=days)

    rooms = {}   # (class slug, start iso) -> {"direct": n, "bundle": n, "via": set()}
    page, seen = 0, 0
    while True:
        res = get("https://api.cal.com/v2/bookings?take=100&skip=%d" % (page * 100), "2024-08-13")
        rows = res.get("data") or []
        if isinstance(rows, dict): rows = rows.get("bookings", [])
        if not rows:
            break
        for b in rows:
            seen += 1
            if str(b.get("status", "")).lower() in ("cancelled", "canceled", "rejected"):
                continue
            start = b.get("start")
            if not start:
                continue
            when = datetime.fromisoformat(start.replace("Z", "+00:00"))
            if when < now or when > horizon:
                continue
            et = by_id.get(b.get("eventTypeId")) or {}
            slug = et.get("slug")
            if not slug:
                continue
            heads = max(1, len(b.get("attendees") or []))
            room = anchor.get(slug, slug)
            k = (room, start)
            r = rooms.setdefault(k, {"direct": 0, "bundle": 0, "via": set()})
            if slug in anchor:
                r["bundle"] += heads
                r["via"].add(slug)
            else:
                r["direct"] += heads
        if len(rows) < 100:
            break
        page += 1

    # Every future date that exists, so empty ones can be shown too
    if show_all:
        for e in ets:
            slug = e.get("slug") or ""
            if slug.endswith("-fff") or not slug:
                continue
            if any(slug.startswith(x) for x in NOT_A_CLASS):
                continue
            try:
                d = get("https://api.cal.com/v2/slots/available?eventTypeSlug=%s&usernameList[]=%s"
                        "&startTime=%s&endTime=%s" % (slug, USER,
                        now.strftime("%Y-%m-%dT00:00:00.000Z"),
                        horizon.strftime("%Y-%m-%dT23:59:59.000Z"))).get("data", {})
            except Exception:
                continue
            sl = d.get("slots", d) or {}
            for day in sl:
                for s in sl[day]:
                    t = s.get("time") or s.get("start")
                    if t:
                        rooms.setdefault((slug, t), {"direct": 0, "bundle": 0, "via": set()})

    print()
    # plain ASCII on purpose - the Windows console mangles a middot
    print("  Class capacity  -  %d seats a class  -  next %d days" % (ROOM, days))
    print("  %d booking(s) scanned" % seen)
    print("  " + "-" * 74)

    if not rooms:
        print("  Nothing booked and no dates scheduled in that window.")
        print()
        return

    over = []
    print("  %-22s %-22s %6s %6s %7s" % ("class", "when", "direct", "bundle", "total"))
    print("  " + "-" * 74)
    for (slug, start), r in sorted(rooms.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        total = r["direct"] + r["bundle"]
        if total == 0 and not show_all:
            continue
        dt, tz = central(start)
        mark = ""
        if total > ROOM:
            mark = "  <-- OVER by %d" % (total - ROOM); over.append((slug, dt, total))
        elif total == ROOM:
            mark = "  <-- full"
        elif total >= WARN_AT:
            mark = "  <-- %d left" % (ROOM - total)
        print("  %-22s %-22s %6d %6d %7s%s" % (slug, fmt(dt), r["direct"], r["bundle"],
                                               "%d/%d" % (total, ROOM), mark))
    print()
    if over:
        print("  ** %d date(s) over ten. Move someone, or add a second slot. **" % len(over))
        for slug, dt, total in over:
            print("     %s on %s has %d" % (slug, fmt(dt), total))
    else:
        print("  Nothing over ten.")
    print()


if __name__ == "__main__":
    main()
