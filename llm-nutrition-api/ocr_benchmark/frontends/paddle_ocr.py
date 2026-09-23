"""PaddleOCR-mobile / PP-OCRv4 adapter.

Lazy-imports `paddleocr` inside __init__ so a missing/failed install only
takes this one frontend out, not the whole harness.
"""

from .base import OCRFrontend


class PaddleOCRFrontend(OCRFrontend):
    name = "PaddleOCR-mobile (PP-OCRv4)"

    def __init__(self, lang: str = "en") -> None:
        from paddleocr import PaddleOCR  # noqa: PLC0415 (intentionally lazy)

        # Pin PP-OCRv4 mobile det/rec explicitly -- PaddleOCR's default for
        # lang="en" on a recent install resolves to the larger PP-OCRv6
        # "medium" models, not the mobile ones this frontend is meant to
        # benchmark. enable_mkldnn=False works around a PIR/oneDNN op
        # ("ConvertPirAttribute2RuntimeAttribute ... DoubleAttribute") that
        # this paddlepaddle build raises on CPU with mkldnn on.
        self._ocr = PaddleOCR(
            lang=lang,
            ocr_version="PP-OCRv4",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,
        )

    def extract_text(self, image_path: str) -> str:
        pages = self._ocr.predict(image_path)
        lines: list[str] = []
        for page in pages or []:
            # PaddleOCR >=3.x OCRResult behaves like a dict with "rec_texts".
            rec_texts = page.get("rec_texts") if hasattr(page, "get") else None
            if rec_texts:
                lines.extend(rec_texts)
        return "\n".join(lines)
