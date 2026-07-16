#!/usr/bin/env python3
"""
Interactive review tool for adding new nutrition label photos to test_cases.csv.

For each image in ~/Dropbox/Nutrition Labels:
  1. Convert/resize to a 1200px-wide PNG (matching the existing images/ convention).
  2. Extract nutrition facts via the same OpenRouter/Gemma-4-31B call used in production.
  3. Serve a local web form pre-filled with the extraction for manual approve/edit.
  4. On submit, append a row to test_cases.csv and copy the image into images/.

Progress is tracked in .label_review_progress.json so the tool can resume where it
left off across sessions.

Usage: python3 scripts/review_new_labels.py
"""

import csv
import html
import json
import os
import re
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()

REPO_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path.home() / "Dropbox" / "Nutrition Labels"
IMAGES_DIR = REPO_DIR / "images"
CSV_PATH = REPO_DIR / "test_cases.csv"
PROGRESS_PATH = REPO_DIR / ".label_review_progress.json"
STAGING_DIR = REPO_DIR / ".review_staging"
ENV_PATH = REPO_DIR / ".env"

TARGET_WIDTH = 1200
SOURCE_EXTS = {".heic", ".png", ".jpg", ".jpeg"}

FIELDS = [
    "servings_per_container",
    "serving_size_grams",
    "calories",
    "total_fat_grams",
    "saturated_fat_grams",
    "trans_fat_grams",
    "polyunsaturated_fat_grams",
    "monounsaturated_fat_grams",
    "cholesterol_mg",
    "sodium_mg",
    "total_carbohydrates_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
    "protein_g",
]

# Kept in sync with src/vlm/mod.rs NUTRITION_PROMPT.
NUTRITION_PROMPT = (
    "Analyze this nutrition facts label. Return ONLY a valid JSON object with these exact fields:\n"
    '{"servings_per_container": <number>, "serving_size_grams": <number>, '
    '"calories": <integer>, "total_fat_grams": <number>, '
    '"saturated_fat_grams": <number>, "trans_fat_grams": <number>, '
    '"polyunsaturated_fat_grams": <number>, "monounsaturated_fat_grams": <number>, '
    '"cholesterol_mg": <number>, "sodium_mg": <number>, '
    '"total_carbohydrates_g": <number>, "dietary_fiber_g": <number>, '
    '"total_sugars_g": <number>, "added_sugars_g": <number>, '
    '"protein_g": <number>}\n'
    "CRITICAL RULES:\n"
    '- Use the exact numeric value shown on the label, including 0 when the label says "0 g" or "0 mg".\n'
    "- NEVER return null for any field, under any circumstances. If a nutrient's own line, "
    'sub-line, or value isn\'t printed on the label at all (e.g. no separate "Added Sugars" line, '
    'or the label states "not a significant source of" a nutrient), infer 0 rather than null.\n'
    "- Read each nutrient strictly from its own printed line. A small or near-zero value "
    '(e.g. "<1g" means 1, not 0), a nested sub-line (e.g. "Includes Xg Added Sugars" under '
    "Total Sugars means added_sugars_g is X, or \"Saturated Fat Xg\"/\"Trans Fat Xg\" under "
    "Total Fat means saturated_fat_grams/trans_fat_grams is X), or a much larger nearby number "
    "(e.g. cholesterol_mg is often far smaller than the sodium_mg on the next line) should never "
    "cause you to default a field to 0 or borrow a neighboring line's value.\n"
    "- Polyunsaturated and monounsaturated fat are sometimes not printed on the label at all; "
    "infer 0 for either in that case, per the never-null rule above.\n"
    "No explanation. No markdown. No code blocks. JSON only."
)


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


ENV = load_env()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY") or ENV.get("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = (
    os.environ.get("OPENROUTER_BASE_URL")
    or ENV.get("OPENROUTER_BASE_URL")
    or "https://openrouter.ai/api/v1"
)
MODEL = "google/gemma-4-31b-it:free"

if not OPENROUTER_API_KEY:
    raise SystemExit(f"OPENROUTER_API_KEY not found in environment or {ENV_PATH}")


def load_progress():
    if PROGRESS_PATH.exists():
        return json.loads(PROGRESS_PATH.read_text())
    return {}


def save_progress(progress):
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2, sort_keys=True))


def build_queue():
    progress = load_progress()
    files = sorted(
        p for p in SOURCE_DIR.iterdir() if p.suffix.lower() in SOURCE_EXTS
    )
    return [
        f for f in files
        if progress.get(f.name, {}).get("status") not in ("done", "skipped")
    ], progress


def new_filename_for(source_path: Path) -> str:
    return f"{source_path.stem}_1200.png"


def convert_image(source_path: Path, dest_path: Path):
    im = Image.open(source_path)
    im = im.convert("RGB")
    w, h = im.size
    new_h = round(h * TARGET_WIDTH / w)
    im = im.resize((TARGET_WIDTH, new_h), Image.LANCZOS)
    im.save(dest_path, format="PNG")


def extract_json(text: str):
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    return text[start:end + 1]


def run_extraction(image_path: Path):
    image_bytes = image_path.read_bytes()
    import base64
    b64 = base64.standard_b64encode(image_bytes).decode()
    data_url = f"data:image/png;base64,{b64}"

    body = json.dumps({
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": NUTRITION_PROMPT},
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 512,
    }).encode()

    req = urllib.request.Request(
        f"{OPENROUTER_BASE_URL}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read())
    except Exception as e:
        return None, f"LLM API request failed: {e}"

    try:
        content = payload["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        return None, f"Unexpected LLM API response: {payload}"

    json_str = extract_json(content) or content
    try:
        facts = json.loads(json_str)
    except json.JSONDecodeError as e:
        return None, f"Failed to parse VLM JSON output: {e}\n{content}"

    return facts, None


def format_value(field, value):
    if field == "calories":
        return str(int(round(float(value))))
    return str(float(value))


class State:
    queue = []
    progress = {}
    filename = None  # original source Path
    staged_path = None  # Path to staged PNG in STAGING_DIR
    facts = None
    error = None


def stage_current():
    """Ensure State points at a converted+extracted image for queue[0]."""
    if not State.queue:
        State.filename = None
        return
    source_path = State.queue[0]
    if State.filename == source_path and State.staged_path and State.staged_path.exists():
        return  # already staged
    STAGING_DIR.mkdir(exist_ok=True)
    staged_path = STAGING_DIR / "current.png"
    convert_image(source_path, staged_path)
    facts, error = run_extraction(staged_path)
    State.filename = source_path
    State.staged_path = staged_path
    State.facts = facts
    State.error = error


def render_form():
    stage_current()
    total_remaining = len(State.queue)
    total_done = len(
        [v for v in State.progress.values() if v.get("status") in ("done", "skipped")]
    )
    total = total_remaining + total_done

    if not State.queue:
        return """<!doctype html><html><body style="font-family: sans-serif; text-align: center; margin-top: 4em;">
        <h1>All images reviewed</h1><p>Nothing left in the queue.</p></body></html>"""

    facts = State.facts or {}
    error_html = ""
    if State.error:
        error_html = f'<p style="color:#b00;">Extraction error: {html.escape(State.error)}</p>'

    rows = []
    for field in FIELDS:
        value = facts.get(field, "")
        rows.append(
            f'<label>{field}<br>'
            f'<input type="number" step="any" name="{field}" value="{html.escape(str(value))}" '
            f'style="width:100%; font-size:1.1em; padding:4px;"></label><br><br>'
        )

    return f"""<!doctype html>
<html>
<head>
<title>Review: {html.escape(State.filename.name)}</title>
<style>
  body {{ font-family: sans-serif; max-width: 900px; margin: 2em auto; display: flex; gap: 2em; }}
  .image-col {{ flex: 1; }}
  .form-col {{ flex: 1; }}
  img {{ max-width: 100%; border: 1px solid #ccc; }}
  button {{ font-size: 1em; padding: 8px 16px; margin-right: 8px; }}
</style>
</head>
<body>
<div class="image-col">
  <h3>{html.escape(State.filename.name)} &mdash; {total_remaining} remaining of {total}</h3>
  <img src="/image" alt="label">
  <form method="post" action="/rotate">
    <button type="submit">Rotate 90&deg; and re-extract</button>
  </form>
</div>
<div class="form-col">
  {error_html}
  <form method="post" action="/submit">
    {''.join(rows)}
    <button type="submit">Approve / Save</button>
  </form>
  <form method="post" action="/skip">
    <button type="submit" style="background:#eee;">Skip (not a label)</button>
  </form>
</div>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep terminal output quiet

    def do_GET(self):
        if self.path == "/image":
            stage_current()
            if State.staged_path and State.staged_path.exists():
                data = State.staged_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()
            return

        html_body = render_form().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html_body)))
        self.end_headers()
        self.wfile.write(html_body)

    def _read_form(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        parsed = urllib.parse.parse_qs(body)
        return {k: v[0] for k, v in parsed.items()}

    def _redirect_home(self):
        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()

    def do_POST(self):
        if self.path == "/submit":
            form = self._read_form()
            source_path = State.filename
            dest_name = new_filename_for(source_path)
            dest_path = IMAGES_DIR / dest_name
            if dest_path.exists():
                self.send_response(409)
                self.end_headers()
                self.wfile.write(f"Collision: {dest_name} already exists".encode())
                return

            row = {"file": dest_name}
            for field in FIELDS:
                row[field] = format_value(field, form[field])

            write_header = not CSV_PATH.exists()
            with open(CSV_PATH, "a", newline="") as f:
                writer = csv.writer(f, quoting=csv.QUOTE_ALL)
                if write_header:
                    writer.writerow(["file"] + FIELDS)
                writer.writerow([row["file"]] + [row[f] for f in FIELDS])

            IMAGES_DIR.mkdir(exist_ok=True)
            State.staged_path.rename(dest_path)

            State.progress[source_path.name] = {"status": "done", "new_filename": dest_name}
            save_progress(State.progress)
            State.queue.pop(0)
            State.filename = None
            State.staged_path = None
            self._redirect_home()
            return

        if self.path == "/skip":
            source_path = State.filename
            State.progress[source_path.name] = {"status": "skipped"}
            save_progress(State.progress)
            State.queue.pop(0)
            if State.staged_path and State.staged_path.exists():
                State.staged_path.unlink()
            State.filename = None
            State.staged_path = None
            self._redirect_home()
            return

        if self.path == "/rotate":
            im = Image.open(State.staged_path)
            im = im.rotate(-90, expand=True)
            im.save(State.staged_path, format="PNG")
            facts, error = run_extraction(State.staged_path)
            State.facts = facts
            State.error = error
            self._redirect_home()
            return

        self.send_response(404)
        self.end_headers()


def main():
    if not SOURCE_DIR.exists():
        raise SystemExit(f"Source directory not found: {SOURCE_DIR}")

    queue, progress = build_queue()
    State.queue = queue
    State.progress = progress

    print(f"{len(queue)} images queued for review ({len(progress)} already processed).")

    port = 8765
    server = HTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Serving review form at {url}")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
