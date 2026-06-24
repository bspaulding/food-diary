# Gemma 4 E2B browser feasibility spike

Throwaway test page, not part of the app build. Answers: does Gemma 4 E2B load and
run in mobile Safari, how fast, and does the web runtime support image input.

## 1. Get a model file

Download (you'll need to be logged into Hugging Face and have accepted the Gemma
license) from `litert-community/gemma-4-E2B-it-litert-lm`:

- Try `gemma-4-E2B-it-web.litertlm` first (current officially recommended web format).
- If that loads but image inference fails, also try `gemma-4-E2B-it-web.task`
  (older MediaPipe Tasks GenAI format) as a second data point.

## 2. Serve this folder over HTTPS so your phone can reach it

WebGPU and module imports generally want a secure context, and mobile Safari needs
to reach this from a real URL (not your laptop's `localhost`). Easiest options:

```bash
# Option A: quick public tunnel (no account needed for a one-off test)
npx serve scratch/gemma-spike -p 8080 &
npx localtunnel --port 8080
# open the https://*.loca.lt URL it prints, on your iPhone in Safari

# Option B: same Wi-Fi network, self-signed cert
npx http-server scratch/gemma-spike -S -p 8080
# open https://<your-laptop-LAN-IP>:8080 on your iPhone, accept the cert warning
```

## 3. Run the page on mobile Safari

1. Open the URL on the iPhone.
2. Check the "Environment check" section first — confirms WebGPU adapter + limits.
3. Pick the model file, tap "Load model" — note the timings shown.
4. Run the text inference test, then the image inference test.
5. Report back: did WebGPU initialize, did the model load, load time, inference
   latency for text and image, whether output was parseable JSON, and the exact
   error text if anything failed.
