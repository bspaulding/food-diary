"""Registry of OCR frontends.

Each entry is (key, display-name-agnostic-factory). The factory is only
invoked (and thus only imports/downloads/loads its model) when the runner
actually asks for that frontend -- see registry.build(). A factory that
raises is caught by the runner and turned into a "skipped" frontend result
with the exception message as the reason, so one missing/broken dependency
never takes down the rest of the run.

To add a new frontend: implement an OCRFrontend subclass in its own module
(lazy-import everything model-related inside __init__/extract_text), then
add one entry to FRONTENDS below. See README.md for the full walkthrough.
"""

from collections.abc import Callable

from .base import FrontendUnavailable, OCRFrontend

FRONTENDS: dict[str, Callable[[], OCRFrontend]] = {}


def _register(key: str, factory: Callable[[], OCRFrontend]) -> None:
    FRONTENDS[key] = factory


def _paddleocr() -> OCRFrontend:
    from .paddle_ocr import PaddleOCRFrontend

    return PaddleOCRFrontend()


def _got_ocr2() -> OCRFrontend:
    from .got_ocr2 import GOTOCR2Frontend

    return GOTOCR2Frontend()


def _smolvlm2() -> OCRFrontend:
    from .smolvlm2 import SmolVLM2Frontend

    return SmolVLM2Frontend()


def _florence2() -> OCRFrontend:
    from .florence2 import Florence2Frontend

    return Florence2Frontend()


def _moondream2() -> OCRFrontend:
    from .moondream2 import Moondream2Frontend

    return Moondream2Frontend()


_register("paddleocr", _paddleocr)
_register("got_ocr2", _got_ocr2)
_register("smolvlm2", _smolvlm2)
_register("florence2", _florence2)
_register("moondream2", _moondream2)


def build(key: str) -> tuple[OCRFrontend | None, str | None]:
    """Construct the frontend for `key`.

    Returns (frontend, None) on success, or (None, reason) if construction
    failed (missing dependency, failed download, OOM, etc.) -- callers
    should record that as a "skipped" frontend rather than aborting.
    """
    factory = FRONTENDS[key]
    try:
        return factory(), None
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any load failure is a skip
        return None, f"{type(exc).__name__}: {exc}"


__all__ = ["FRONTENDS", "FrontendUnavailable", "OCRFrontend", "build"]
