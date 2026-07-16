#!/usr/bin/env python3
"""
One-time backfill tool: fills in saturated_fat_grams, trans_fat_grams,
polyunsaturated_fat_grams, and monounsaturated_fat_grams for rows in test_cases.csv
that predate those columns (empty string in the CSV).

Reuses the same extraction call as review_new_labels.py, run against the existing
images/ (already 1200px, no conversion needed). Only the 4 new fields are editable;
the other columns are shown read-only for context and are never rewritten.

Usage: python3 scripts/backfill_fat_fields.py
"""

import csv
import html
import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from review_new_labels import FIELDS, IMAGES_DIR, run_extraction, format_value  # noqa: E402

REPO_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_DIR / "test_cases.csv"

NEW_FIELDS = [
    "saturated_fat_grams",
    "trans_fat_grams",
    "polyunsaturated_fat_grams",
    "monounsaturated_fat_grams",
]


def load_rows():
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    return fieldnames, rows


def save_rows(fieldnames, rows):
    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)


def needs_backfill(row):
    return any(row.get(f, "") == "" for f in NEW_FIELDS)


class State:
    fieldnames = []
    rows = []
    index = -1  # index into rows of the row currently staged
    facts = None
    error = None


def next_index(start=0):
    for i in range(start, len(State.rows)):
        if needs_backfill(State.rows[i]):
            return i
    return None


def stage_current():
    if State.index is not None and 0 <= State.index < len(State.rows) and needs_backfill(State.rows[State.index]):
        if State.facts is not None or State.error is not None:
            return  # already staged
    idx = next_index(0)
    State.index = idx
    if idx is None:
        return
    image_path = IMAGES_DIR / State.rows[idx]["file"]
    facts, error = run_extraction(image_path)
    State.facts = facts
    State.error = error


def render_form():
    stage_current()
    remaining = sum(1 for r in State.rows if needs_backfill(r))
    total = len(State.rows)

    if State.index is None:
        return """<!doctype html><html><body style="font-family: sans-serif; text-align: center; margin-top: 4em;">
        <h1>Backfill complete</h1><p>All rows have saturated/trans/poly/monounsaturated fat filled in.</p></body></html>"""

    row = State.rows[State.index]
    facts = State.facts or {}
    error_html = ""
    if State.error:
        error_html = f'<p style="color:#b00;">Extraction error: {html.escape(State.error)}</p>'

    context_rows = "".join(
        f"<tr><td>{html.escape(f)}</td><td>{html.escape(row.get(f, ''))}</td></tr>"
        for f in FIELDS
        if f not in NEW_FIELDS
    )

    editable_rows = []
    for field in NEW_FIELDS:
        value = facts.get(field, "")
        editable_rows.append(
            f'<label>{field}<br>'
            f'<input type="number" step="any" name="{field}" value="{html.escape(str(value))}" '
            f'style="width:100%; font-size:1.1em; padding:4px;"></label><br><br>'
        )

    return f"""<!doctype html>
<html>
<head>
<title>Backfill: {html.escape(row['file'])}</title>
<style>
  body {{ font-family: sans-serif; max-width: 900px; margin: 2em auto; display: flex; gap: 2em; }}
  .image-col {{ flex: 1; }}
  .form-col {{ flex: 1; }}
  img {{ max-width: 100%; border: 1px solid #ccc; }}
  table {{ font-size: 0.9em; color: #555; }}
  button {{ font-size: 1em; padding: 8px 16px; margin-right: 8px; }}
</style>
</head>
<body>
<div class="image-col">
  <h3>{html.escape(row['file'])} &mdash; {remaining} remaining of {total}</h3>
  <img src="/image" alt="label">
  <table>{context_rows}</table>
</div>
<div class="form-col">
  {error_html}
  <form method="post" action="/submit">
    {''.join(editable_rows)}
    <button type="submit">Approve / Save</button>
  </form>
</div>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path == "/image":
            stage_current()
            if State.index is not None:
                data = (IMAGES_DIR / State.rows[State.index]["file"]).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()
            return

        body = render_form().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/submit":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode()
            form = {k: v[0] for k, v in urllib.parse.parse_qs(body).items()}

            row = State.rows[State.index]
            for field in NEW_FIELDS:
                row[field] = format_value(field, form[field])
            save_rows(State.fieldnames, State.rows)

            State.facts = None
            State.error = None
            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()
            return

        self.send_response(404)
        self.end_headers()


def main():
    fieldnames, rows = load_rows()
    State.fieldnames = fieldnames
    State.rows = rows

    remaining = sum(1 for r in rows if needs_backfill(r))
    print(f"{remaining} of {len(rows)} rows need saturated/trans/poly/monounsaturated fat backfilled.")

    port = 8766
    server = HTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Serving backfill form at {url}")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
