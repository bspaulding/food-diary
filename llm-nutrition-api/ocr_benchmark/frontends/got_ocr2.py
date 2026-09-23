"""GOT-OCR2.0 adapter (stepfun-ai/GOT-OCR2_0 on HuggingFace).

Lazy-imports torch/transformers and only downloads/loads weights on first
construction.
"""

from .base import OCRFrontend

_MODEL_ID = "stepfun-ai/GOT-OCR2_0"


class GOTOCR2Frontend(OCRFrontend):
    name = "GOT-OCR2.0"

    def __init__(self, model_id: str = _MODEL_ID, device: str | None = None) -> None:
        import torch  # noqa: PLC0415
        from transformers import AutoModel, AutoTokenizer  # noqa: PLC0415

        self._torch = torch
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        self._model = AutoModel.from_pretrained(
            model_id,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            use_safetensors=True,
        )
        self._model = self._model.eval().to(self._device)

    def extract_text(self, image_path: str) -> str:
        # GOT-OCR2.0 ships a custom `.chat` method (plain-text OCR mode).
        return self._model.chat(self._tokenizer, image_path, ocr_type="ocr")
