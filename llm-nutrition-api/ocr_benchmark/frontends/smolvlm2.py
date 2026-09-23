"""SmolVLM2 (small variant) adapter, via transformers image-text-to-text pipeline."""

from .base import OCRFrontend

_MODEL_ID = "HuggingFaceTB/SmolVLM2-256M-Video-Instruct"
_PROMPT = "Transcribe all text visible in this image, verbatim, preserving line breaks."


class SmolVLM2Frontend(OCRFrontend):
    name = "SmolVLM2 (256M)"

    def __init__(self, model_id: str = _MODEL_ID, device: str | None = None) -> None:
        import torch  # noqa: PLC0415
        from transformers import AutoModelForImageTextToText, AutoProcessor  # noqa: PLC0415

        self._torch = torch
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._processor = AutoProcessor.from_pretrained(model_id)
        self._model = AutoModelForImageTextToText.from_pretrained(
            model_id,
            torch_dtype=torch.float32,
        ).to(self._device)

    def extract_text(self, image_path: str) -> str:
        from PIL import Image  # noqa: PLC0415

        image = Image.open(image_path).convert("RGB")
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ]
        prompt = self._processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self._processor(text=prompt, images=[image], return_tensors="pt").to(self._device)
        generated = self._model.generate(**inputs, max_new_tokens=512)
        text = self._processor.batch_decode(generated, skip_special_tokens=True)[0]
        # Strip the echoed prompt, if any, leaving only the assistant reply.
        return text.split(_PROMPT)[-1].strip()
