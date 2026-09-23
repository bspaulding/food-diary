"""Florence-2 adapter, using its built-in <OCR> task token."""

from .base import OCRFrontend

_MODEL_ID = "microsoft/Florence-2-base"
_TASK = "<OCR>"


class Florence2Frontend(OCRFrontend):
    name = "Florence-2 (OCR task)"

    def __init__(self, model_id: str = _MODEL_ID, device: str | None = None) -> None:
        import torch  # noqa: PLC0415
        from transformers import AutoModelForCausalLM, AutoProcessor  # noqa: PLC0415

        self._torch = torch
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        self._model = (
            AutoModelForCausalLM.from_pretrained(model_id, trust_remote_code=True)
            .eval()
            .to(self._device)
        )

    def extract_text(self, image_path: str) -> str:
        from PIL import Image  # noqa: PLC0415

        image = Image.open(image_path).convert("RGB")
        inputs = self._processor(text=_TASK, images=image, return_tensors="pt").to(self._device)
        generated_ids = self._model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            num_beams=1,
        )
        generated_text = self._processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
        parsed = self._processor.post_process_generation(
            generated_text, task=_TASK, image_size=(image.width, image.height)
        )
        return parsed.get(_TASK, "")
