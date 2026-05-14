#!/usr/bin/env python3
"""
Test the OpenRouter VLM path against the passing OCR test cases.
Mirrors the logic in src/vlm/openrouter.rs.
"""

import base64, csv, json, os, sys, time
import urllib.request, urllib.error

NUTRITION_PROMPT = (
    "Analyze this nutrition facts label. Return ONLY a valid JSON object with these exact fields:\n"
    '{"servings_per_container": <number|null>, "serving_size_grams": <number|null>, '
    '"calories": <integer|null>, "total_fat_grams": <number|null>, '
    '"cholesterol_mg": <number|null>, "sodium_mg": <number|null>, '
    '"total_carbohydrates_g": <number|null>, "dietary_fiber_g": <number|null>, '
    '"total_sugars_g": <number|null>, "added_sugars_g": <number|null>, '
    '"protein_g": <number|null>}\n'
    "CRITICAL RULES:\n"
    "- Use the exact numeric value shown on the label, including 0 when the label says \"0 g\" or \"0 mg\".\n"
    "- Use null ONLY if that nutrient field does not appear on the label at all.\n"
    "- Do NOT use null when the label shows 0. Use 0 instead.\n"
    "No explanation. No markdown. No code blocks. JSON only."
)

# Cases known-failing for OCR (skip list from main.rs tests)
SKIP = {
    "IMG_5421_1200.png", "IMG_5423_1200.png", "IMG_5422_1200.png",
    "IMG_5436_1200.png", "IMG_5426_1200.png", "IMG_5430_1200.png",
    "IMG_5457_1200.png", "IMG_5456_1200.png", "IMG_5442_1200.png",
    "IMG_5445_1200.png", "IMG_5444_1200.png", "IMG_5450_1200.png",
    "IMG_5446_1200.png", "IMG_5452_1200.png", "IMG_5447_1200.png",
    "IMG_5462_1200.png", "IMG_5461_1200.png", "IMG_5460_1200.png",
    "IMG_5448_1200.png", "IMG_5464_1200.png", "IMG_5458_1200.png",
    "IMG_5429_1200.png", "IMG_5428_1200.png", "IMG_5439_1200.png",
}

FIELDS = [
    "servings_per_container", "serving_size_grams", "calories",
    "total_fat_grams", "cholesterol_mg", "sodium_mg",
    "total_carbohydrates_g", "dietary_fiber_g", "total_sugars_g",
    "added_sugars_g", "protein_g",
]

API_KEY = os.environ["OPENROUTER_API_KEY"]
MODEL   = os.environ.get("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")


def call_openrouter(image_bytes: bytes, max_retries: int = 4) -> dict:
    b64 = base64.b64encode(image_bytes).decode()
    data_url = f"data:image/jpeg;base64,{b64}"

    payload = json.dumps({
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text",      "text": NUTRITION_PROMPT},
            ],
        }],
        "temperature": 0.1,
        "max_tokens": 512,
    }).encode()

    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read())
                return body
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                delay = 1 << attempt
                retry_after = e.headers.get("retry-after")
                if retry_after:
                    try: delay = int(retry_after)
                    except ValueError: pass
                print(f"  429 rate-limited, retrying in {delay}s …", flush=True)
                time.sleep(delay)
                continue
            raise


def extract_json(text: str) -> str:
    start = text.find("{")
    end   = text.rfind("}")
    if start != -1 and end >= start:
        return text[start:end+1]
    return text


def coerce(val, field: str):
    if val is None:
        return None
    if field == "calories":
        return int(round(float(val)))
    return float(val)


def compare(expected: dict, actual: dict) -> list[str]:
    errors = []
    for f in FIELDS:
        ev = coerce(expected.get(f), f)
        av = coerce(actual.get(f),   f)
        if ev is None and av is None:
            continue
        if ev is None or av is None:
            errors.append(f"  {f}: expected {ev}, got {av}")
            continue
        if f == "calories":
            if abs(ev - av) > 5:
                errors.append(f"  {f}: expected {ev}, got {av}  (diff {av-ev:+d})")
        else:
            tol = max(0.5, abs(ev) * 0.1)
            if abs(ev - av) > tol:
                errors.append(f"  {f}: expected {ev}, got {av}  (diff {av-ev:+.1f})")
    return errors


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path   = os.path.join(script_dir, "test_cases.csv")
    img_dir    = os.path.join(script_dir, "images")

    with open(csv_path) as f:
        rows = list(csv.DictReader(f))

    passing_rows = [r for r in rows if r["file"] not in SKIP]
    print(f"Testing {len(passing_rows)} passing OCR cases via OpenRouter ({MODEL})\n")

    total = 0
    passed = 0
    all_errors: list[tuple[str, list[str]]] = []

    for row in passing_rows:
        fname = row["file"]
        img_path = os.path.join(img_dir, fname)
        if not os.path.exists(img_path):
            print(f"[SKIP] {fname} — image file missing")
            continue

        total += 1
        print(f"[{total}/{len(passing_rows)}] {fname} … ", end="", flush=True)

        with open(img_path, "rb") as f:
            img_bytes = f.read()

        try:
            resp = call_openrouter(img_bytes)
            raw  = resp["choices"][0]["message"]["content"].strip()
        except Exception as e:
            print(f"ERROR: {e}")
            all_errors.append((fname, [f"  API error: {e}"]))
            continue

        try:
            actual = json.loads(extract_json(raw))
        except json.JSONDecodeError as e:
            print(f"JSON PARSE ERROR")
            print(f"  raw output: {raw!r}")
            all_errors.append((fname, [f"  JSON parse error: {e}", f"  raw: {raw!r}"]))
            continue

        expected = {f: row[f] if row[f] != "" else None for f in FIELDS}
        errors = compare(expected, actual)

        if errors:
            print("FAIL")
            for err in errors:
                print(err)
            all_errors.append((fname, errors))
        else:
            print("PASS")
            passed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} passed")
    if all_errors:
        print(f"\nFailed cases:")
        for fname, errs in all_errors:
            print(f"  {fname}:")
            for e in errs:
                print(f"    {e}")
    print(f"Model: {MODEL}")


if __name__ == "__main__":
    main()
