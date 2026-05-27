The LLM backend for two services in food-diary has been switched from OpenRouter (free-tier Gemma 4) to Google AI direct via their OpenAI-compatible API. Update the Kubernetes manifests accordingly.

IMAGE TAGS TO UPDATE

llm-nutrition-api: ghcr.io/bspaulding/food-diary/llm-nutrition-api:v0.2.3
nutrition-fact-labeller: ghcr.io/bspaulding/food-diary/nutrition-fact-labeller:v1.1.2

ENV VAR CHANGES

OPENROUTER_API_KEY → LLM_API_KEY. Value changes: was an OpenRouter key (sk-or-v1-…), now a Google AI Studio key (AIza…).
OPENROUTER_MODEL → LLM_MODEL. New value: gemini-2.5-flash.
OPENROUTER_BASE_URL → LLM_BASE_URL. New value: https://generativelanguage.googleapis.com/v1beta/openai.

The old OPENROUTER_* names still work as code-level fallbacks, but manifests should use the new canonical names going forward. LLM_BASE_URL and LLM_MODEL have correct defaults baked into the binaries, so they only need to appear in the manifests if you want to pin or override them.

CHANGES TO MAKE

1. Update the image tag in the Deployment for both services to the versions listed above.
2. Rename any OPENROUTER_API_KEY secret key references to LLM_API_KEY in all manifests — Deployment env/envFrom, Secret data keys, ExternalSecret/SealedSecret remoteRef paths, etc.
3. Rename OPENROUTER_MODEL to LLM_MODEL and OPENROUTER_BASE_URL to LLM_BASE_URL wherever they appear.
4. If the model name is pinned in a ConfigMap or Deployment env, update its value to gemini-2.5-flash.
5. If the base URL is pinned, update it to https://generativelanguage.googleapis.com/v1beta/openai.
6. If secrets are managed via an external secret store (AWS Secrets Manager, Vault, etc.), update the remote key path/name to match the new LLM_API_KEY name, and note in the PR description that the actual secret value in the store must be updated to the new Google AI key before rollout.
7. Update any comments in the manifests that reference OpenRouter.
8. Do not change anything related to GEMMA_MODEL_PATH, VLM_MODEL_PATH, VLM_MMPROJ_PATH, or the PVC/init-container setup for local model weights — those are unaffected.

PR DESCRIPTION SHOULD INCLUDE

Note that the Google AI API key must be populated in the secret store before the rollout proceeds. Reference branch claude/openrouter-performance-reliability-4suQK in bspaulding/food-diary.
