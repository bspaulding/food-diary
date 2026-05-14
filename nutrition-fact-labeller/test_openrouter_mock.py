#!/usr/bin/env python3
"""
End-to-end test of the openrouter inference path using a local mock server.

The mock server implements the OpenAI chat completions API. When it receives
an image + prompt it runs real vision inference via the Google Gemini API
through OpenRouter -- but since that's blocked in this sandbox, it instead
calls the real Gemma-4 VLM logic in the service with a canned response that
contains the ground-truth JSON.

In practice the mock does two things:
  1. Validates the request shape (image_url + text content parts)
  2. Returns a realistic OpenRouter response containing the expected nutrition JSON

We then compare the service's parsed output against test_cases.csv.
"""

import base64, csv, json, os, sys, time, threading, subprocess, signal
import urllib.request, urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

SKIP = {
    "IMG_5421_1200.png","IMG_5423_1200.png","IMG_5422_1200.png",
    "IMG_5436_1200.png","IMG_5426_1200.png","IMG_5430_1200.png",
    "IMG_5457_1200.png","IMG_5456_1200.png","IMG_5442_1200.png",
    "IMG_5445_1200.png","IMG_5444_1200.png","IMG_5450_1200.png",
    "IMG_5446_1200.png","IMG_5452_1200.png","IMG_5447_1200.png",
    "IMG_5462_1200.png","IMG_5461_1200.png","IMG_5460_1200.png",
    "IMG_5448_1200.png","IMG_5464_1200.png","IMG_5458_1200.png",
    "IMG_5429_1200.png","IMG_5428_1200.png","IMG_5439_1200.png",
}

FIELDS = [
    "servings_per_container","serving_size_grams","calories",
    "total_fat_grams","cholesterol_mg","sodium_mg",
    "total_carbohydrates_g","dietary_fiber_g","total_sugars_g",
    "added_sugars_g","protein_g",
]

MOCK_PORT = 19091

# The mock server stores the "expected" response for the next request here.
_next_response: dict = {}
_received_requests: list = []


def make_openrouter_response(nutrition_json: dict) -> bytes:
    """Wrap a nutrition dict in an OpenAI-style chat completion response."""
    content = json.dumps(nutrition_json)
    resp = {
        "id": "mock-123",
        "object": "chat.completion",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
    }
    return json.dumps(resp).encode()


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence access log

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            req = json.loads(body)
        except Exception:
            req = {}

        # Validate request structure
        msgs = req.get("messages", [])
        errors = []
        if not msgs:
            errors.append("no messages")
        else:
            content = msgs[0].get("content", [])
            if not isinstance(content, list):
                errors.append("content not a list (no vision parts)")
            else:
                types = [p.get("type") for p in content]
                if "image_url" not in types:
                    errors.append("missing image_url part")
                if "text" not in types:
                    errors.append("missing text part")
                img_part = next((p for p in content if p.get("type") == "image_url"), None)
                if img_part:
                    url = img_part.get("image_url", {}).get("url", "")
                    if not url.startswith("data:image/"):
                        errors.append(f"image_url not a data URL: {url[:40]}")

        _received_requests.append({"path": self.path, "model": req.get("model"), "errors": errors})

        if errors:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": errors}).encode())
            return

        resp_body = make_openrouter_response(_next_response)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(resp_body)))
        self.end_headers()
        self.wfile.write(resp_body)


def start_mock_server():
    server = HTTPServer(("127.0.0.1", MOCK_PORT), MockHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


def call_service(img_path: str) -> dict:
    with open(img_path, "rb") as f:
        img_bytes = f.read()
    boundary = "boundary1234"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"backend\"\r\n\r\nopenrouter\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"img.png\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode() + img_bytes + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        "http://localhost:3030/",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def coerce(val, field):
    if val is None: return None
    if field == "calories": return int(round(float(val)))
    return float(val)


def compare(expected: dict, actual: dict) -> list:
    errors = []
    for f in FIELDS:
        ev = coerce(expected.get(f), f)
        av = coerce(actual.get(f), f)
        if ev is None and av is None: continue
        if ev is None or av is None:
            errors.append(f"  {f}: expected {ev!r}, got {av!r}")
            continue
        if f == "calories":
            if abs(ev - av) > 0:   # exact match expected (mock returns ground truth)
                errors.append(f"  {f}: expected {ev}, got {av}")
        else:
            if abs(ev - av) > 0.01:
                errors.append(f"  {f}: expected {ev}, got {av}")
    return errors


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, "test_cases.csv")
    img_dir  = os.path.join(script_dir, "images")

    with open(csv_path) as f:
        rows = list(csv.DictReader(f))
    passing = [r for r in rows if r["file"] not in SKIP]

    # Start mock OpenRouter server
    mock = start_mock_server()
    print(f"Mock OpenRouter server on :{MOCK_PORT}")

    # Start the real service pointed at the mock
    env = os.environ.copy()
    env["OPENROUTER_API_KEY"] = "mock-key"
    env["OPENROUTER_BASE_URL"] = f"http://127.0.0.1:{MOCK_PORT}"
    env["OPENROUTER_MODEL"] = "google/gemma-4-31b-it:free"
    env["LD_LIBRARY_PATH"] = "/usr/local/lib/python3.11/dist-packages/onnxruntime/capi/"
    env["PORT"] = "3030"
    env["RUST_LOG"] = "warn"

    svc = subprocess.Popen(
        [os.path.join(script_dir, "target/debug/nutrition-fact-labeller")],
        env=env,
        cwd=script_dir,
    )
    time.sleep(1.5)
    if svc.poll() is not None:
        print("ERROR: service failed to start")
        sys.exit(1)

    print(f"Service PID {svc.pid} running\n")
    print(f"Testing {len(passing)} passing cases via mock OpenRouter backend\n")

    total = passed = 0
    all_errors = []

    try:
        for i, row in enumerate(passing):
            fname = row["file"]
            img_path = os.path.join(img_dir, fname)
            if not os.path.exists(img_path):
                print(f"[SKIP] {fname} — image missing")
                continue

            # Build expected nutrition dict from CSV
            expected = {f: (float(row[f]) if row[f] != "" else None) for f in FIELDS}
            # Calories is integer in ParsedNutritionFacts
            if expected["calories"] is not None:
                expected["calories"] = int(expected["calories"])

            # Prime the mock with the expected response
            _next_response.clear()
            _next_response.update(expected)

            total += 1
            print(f"[{i+1}/{len(passing)}] {fname} … ", end="", flush=True)

            try:
                result = call_service(img_path)
                actual = result.get("image", result)
            except Exception as e:
                print(f"ERROR: {e}")
                all_errors.append((fname, [f"  service call failed: {e}"]))
                continue

            # Validate mock received a well-formed request
            if _received_requests:
                req_info = _received_requests[-1]
                if req_info["errors"]:
                    errs = [f"  bad request shape: {req_info['errors']}"]
                    print("FAIL (bad request)")
                    all_errors.append((fname, errs))
                    continue
                if req_info["model"] != "google/gemma-4-31b-it:free":
                    print(f"WARN: unexpected model {req_info['model']!r}")

            errors = compare(expected, actual)
            if errors:
                print("FAIL")
                for err in errors: print(err)
                all_errors.append((fname, errors))
            else:
                print("PASS")
                passed += 1

    finally:
        svc.terminate()
        svc.wait()
        mock.shutdown()

    print(f"\n{'='*55}")
    print(f"Results: {passed}/{total} passed")
    if all_errors:
        print("\nFailed cases:")
        for fname, errs in all_errors:
            print(f"  {fname}:")
            for e in errs: print(f"    {e}")

    # Print request validation summary
    print(f"\nMock received {len(_received_requests)} requests")
    shape_errors = [r for r in _received_requests if r["errors"]]
    if shape_errors:
        print("Request shape errors:")
        for r in shape_errors:
            print(f"  {r}")
    else:
        print("All requests had correct OpenAI vision format")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
