#!/usr/bin/env python3
"""GFC Coeliac Guide - pull new review-form responses and stage them for Tee's approval.

Usage:
  python gfc-review-merge.py pull     # fetch new responses -> new-reviews-draft.json (pending Tee approval)
  python gfc-review-merge.py approve  # move rows Tee marked "approved" in the draft -> reviews-seed.json + venues updates

Tee's flow:
  1. Run `pull` after members use the review form.
  2. Open new-reviews-draft.json, set "decision": "approved" (or "rejected") on each row.
  3. Run `approve` to publish approved rows into the app data, then push.
"""
import json, sys, os, re, time

HERE = os.path.dirname(os.path.abspath(__file__))
FORM_ID = "1xmSZm-EB504krHYAu56URMnRYY91dS81WTddnbSmtjA"
FORM_FILE = os.path.join(HERE, "review-form.json")
SEED_FILE = os.path.join(HERE, "reviews-seed.json")
DRAFT_FILE = os.path.join(HERE, "new-reviews-draft.json")

SCALES = {"1": 1, "2": 2, "3": 3, "4": 4, "5": 5}


def gsession():
    sys.path.insert(0, r"C:/Users/trici/AppData/Local/hermes/hermes-agent/skills/productivity/google-workspace/scripts")
    import google_api
    from google.auth.transport.requests import AuthorizedSession
    return AuthorizedSession(google_api.get_credentials())


def load_venues():
    src = open(os.path.join(HERE, "venues.js"), encoding="utf-8").read()
    blob = src.split("const VENUES=")[1].split(";\nconst TAGS")[0]
    return json.loads(blob)


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def match_venue(name, suburb, venues):
    """Find the venue index by name; return (idx, confidence) or (None, name)."""
    n = norm(name)
    if not n:
        return None, None
    # exact name
    for i, v in enumerate(venues):
        if norm(v[0]) == n:
            return i, "exact"
    # unique substring
    hits = [i for i, v in enumerate(venues) if n in norm(v[0]) or norm(v[0]) in n]
    if len(hits) == 1:
        return hits[0], "fuzzy"
    # try suburb to disambiguate
    if suburb:
        sb = norm(suburb)
        hits2 = [i for i in hits if sb and sb in norm(venues[i][4])]
        if len(hits2) == 1:
            return hits2[0], "fuzzy+suburb"
    return None, ("ambiguous: " + ", ".join(venues[h][0] for h in hits[:5]) if hits else "no match")


def pull():
    session = gsession()
    form = json.load(open(FORM_FILE, encoding="utf-8"))
    items = form["items"]
    # map questionId -> title (response answers are keyed by questionId)
    qmap = {}
    for it in items:
        q = it.get("questionItem", {}).get("question", {})
        qid = q.get("questionId")
        if qid:
            qmap[qid] = it["title"]

    r = session.get(f"https://forms.googleapis.com/v1/forms/{FORM_ID}/responses")
    if r.status_code != 200:
        print("responses fetch failed:", r.status_code, r.text[:200])
        return
    responses = r.json().get("responses", [])
    venues = load_venues()
    draft = json.load(open(DRAFT_FILE, encoding="utf-8")) if os.path.exists(DRAFT_FILE) else []
    handled = {(d.get("responseId")) for d in draft}
    new = 0
    for resp in responses:
        rid = resp.get("responseId")
        if rid in handled:
            continue
        answers = {}
        for qid, a in (resp.get("answers") or {}).items():
            title = qmap.get(qid, qid)
            val = a.get("textAnswer") or None
            if a.get("scaleAnswer") is not None:
                val = str(a["scaleAnswer"])
            if a.get("textAnswers", {}).get("answers"):
                val = "; ".join(x.get("value", "") for x in a["textAnswers"]["answers"])
            if a.get("choiceAnswers", {}).get("answers"):
                val = a["choiceAnswers"]["answers"]
            answers[title] = val
        stars = SCALES.get(str(answers.get("Star rating", "")).strip(), None)
        vname = answers.get("Venue name", "")
        suburb = answers.get("Suburb", "")
        idx, conf = match_venue(vname, suburb, venues)
        row = {
            "responseId": rid,
            "submitted": resp.get("lastSubmittedTime", "")[:10],
            "venueTyped": vname,
            "suburbTyped": suburb,
            "matchedIdx": idx,
            "matchConfidence": conf,
            "matchedName": venues[idx][0] if idx is not None else None,
            "stars": stars,
            "goodThings": answers.get("What felt good for gluten-free? (tick all that apply)") or [],
            "quote": (answers.get("Your one-line review") or "").strip(),
            "shownName": (answers.get("Your name or initials (as you'd like it shown)") or "").strip() or "GFC member",
            "member": (answers.get("Are you a Gluten Free Club member?") or [""])[0] if isinstance(answers.get("Are you a Gluten Free Club member?"), list) else answers.get("Are you a Gluten Free Club member?"),
            "decision": "pending",  # Tee sets: approved / rejected
        }
        draft.append(row)
        new += 1
    json.dump(draft, open(DRAFT_FILE, "w", encoding="utf-8"), indent=1)
    print(f"pulled {len(responses)} total responses; {new} new -> {DRAFT_FILE}")
    pending = sum(1 for d in draft if d.get("decision") == "pending")
    print(f"pending Tee decision: {pending}")


def approve():
    draft = json.load(open(DRAFT_FILE, encoding="utf-8"))
    venues = load_venues()
    seed = json.load(open(SEED_FILE, encoding="utf-8"))
    added = 0
    for d in draft:
        if d.get("decision") != "approved" or d.get("published"):
            continue
        if d["matchedIdx"] is None:
            print("SKIP (no venue match):", d["venueTyped"])
            continue
        idx = d["matchedIdx"]
        # compute a friendly relative date
        try:
            import datetime
            sub = datetime.datetime.fromisoformat(d["submitted"].replace("Z", "+00:00"))
            days = (datetime.datetime.now(datetime.timezone.utc) - sub).days
            when = "just now" if days <= 0 else ("this week" if days < 7 else f"{max(1, days // 7)} weeks ago")
        except Exception:
            when = "just now"
        stars = d.get("stars")
        good = d.get("goodThings") or []
        row = {
            "text": d["quote"],
            "src": "via GFC review form",
            "date": when,
            "author": d["shownName"],
            "sent": "negative" if stars is not None and stars <= 2 else "positive",
            "practices": [g[0].lower() + g[1:] for g in good],
            "link": "https://forms.gle/gfc-review-form",
            "thread": "",
            "idx": idx,
        }
        seed.append(row)
        d["published"] = True
        added += 1
    json.dump(seed, open(SEED_FILE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    json.dump(draft, open(DRAFT_FILE, "w", encoding="utf-8"), indent=1)
    print(f"published {added} approved reviews into reviews-seed.json - now git push to make them live")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pull"
    if cmd == "pull":
        pull()
    elif cmd == "approve":
        approve()
    else:
        print(__doc__)
