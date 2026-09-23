"""Common interface every OCR frontend adapter implements."""

from abc import ABC, abstractmethod


class OCRFrontend(ABC):
    """A single OCR "frontend": image in, raw text out.

    Adapters MUST NOT load any model weights or import heavy/optional
    dependencies at module import time. All of that belongs in __init__ (or
    lazily on first call), so that a missing dependency only breaks the one
    frontend that needs it -- see frontends/registry.py, which wraps
    construction in a try/except and marks the frontend "skipped" rather than
    letting the whole harness crash.
    """

    name: str

    @abstractmethod
    def extract_text(self, image_path: str) -> str:
        """Run OCR on the image at image_path and return the raw text."""
        raise NotImplementedError


class FrontendUnavailable(Exception):
    """Raised (or wrapped) when a frontend's dependencies/weights can't be loaded."""
