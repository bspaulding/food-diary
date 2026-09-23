"""Moondream2 adapter (vikhyatk/moondream2 on HuggingFace)."""

from .base import OCRFrontend

_MODEL_ID = "vikhyatk/moondream2"
_MODEL_REVISION = "2024-08-26"
_PROMPT = "Transcribe all text visible in this image, verbatim, preserving line breaks."


class Moondream2Frontend(OCRFrontend):
    name = "Moondream2"

    def __init__(self, model_id: str = _MODEL_ID, revision: str = _MODEL_REVISION) -> None:
        import torch  # noqa: PLC0415
        from transformers import AutoModelForCausalLM, AutoTokenizer  # noqa: PLC0415

        self._torch = torch
        self._model = AutoModelForCausalLM.from_pretrained(
            model_id, trust_remote_code=True, revision=revision
        )
        self._tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)

    def extract_text(self, image_path: str) -> str:
        from PIL import Image  # noqa: PLC0415

        image = Image.open(image_path).convert("RGB")
        encoded = self._model.encode_image(image)
        return self._model.answer_question(encoded, _PROMPT, self._tokenizer)
