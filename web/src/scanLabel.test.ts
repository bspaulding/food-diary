import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import { resizeImage, scanLabelImage } from "./scanLabel";

let imageSize = { width: 400, height: 300 };
let imageShouldFail = false;
let toBlobResult: Blob | null = new Blob(["x"], { type: "image/jpeg" });
let ctx: { drawImage: ReturnType<typeof vi.fn> } | null;
let lastCanvas: { width: number; height: number } | null = null;

class MockImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => {
      if (imageShouldFail) {
        this.onerror?.();
        return;
      }
      this.width = imageSize.width;
      this.height = imageSize.height;
      this.onload?.();
    });
  }
}

const imageFile = () => new File(["img"], "label.jpg", { type: "image/jpeg" });

describe("scanLabel", () => {
  beforeEach(() => {
    imageSize = { width: 400, height: 300 };
    imageShouldFail = false;
    toBlobResult = new Blob(["x"], { type: "image/jpeg" });
    ctx = { drawImage: vi.fn() };
    lastCanvas = null;
    vi.stubGlobal("Image", MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        lastCanvas = this;
        return ctx as unknown as CanvasRenderingContext2D;
      } as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((
      cb: BlobCallback,
    ) => cb(toBlobResult)) as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("resizeImage", () => {
    it("keeps small images at their size", async () => {
      const blob = await resizeImage(imageFile());
      expect(blob).toBe(toBlobResult);
      expect(lastCanvas).toMatchObject({ width: 400, height: 300 });
    });

    it("scales down wide images to 1080 max", async () => {
      imageSize = { width: 2160, height: 1080 };
      await resizeImage(imageFile());
      expect(lastCanvas).toMatchObject({ width: 1080, height: 540 });
    });

    it("scales down tall images to 1080 max", async () => {
      imageSize = { width: 1080, height: 2160 };
      await resizeImage(imageFile());
      expect(lastCanvas).toMatchObject({ width: 540, height: 1080 });
    });

    it("rejects when the image fails to load", async () => {
      imageShouldFail = true;
      await expect(resizeImage(imageFile())).rejects.toThrow(
        "Failed to load image",
      );
    });

    it("rejects when there is no canvas context", async () => {
      ctx = null;
      await expect(resizeImage(imageFile())).rejects.toThrow(
        "Failed to get canvas context",
      );
    });

    it("rejects when the canvas produces no blob", async () => {
      toBlobResult = null;
      await expect(resizeImage(imageFile())).rejects.toThrow(
        "Failed to create blob from canvas",
      );
    });

    it("rejects when drawing throws", async () => {
      ctx = {
        drawImage: vi.fn(() => {
          throw new Error("draw failed");
        }),
      };
      await expect(resizeImage(imageFile())).rejects.toThrow("draw failed");
    });

    it("rejects when the file cannot be read", async () => {
      vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
        function (this: FileReader) {
          this.onerror?.(new ProgressEvent("error") as never);
        },
      );
      await expect(resizeImage(imageFile())).rejects.toThrow(
        "Failed to read file",
      );
    });

    it("rejects when the read result is not a string", async () => {
      vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(
        function (this: FileReader) {
          this.onload?.({ target: { result: null } } as never);
        },
      );
      await expect(resizeImage(imageFile())).rejects.toThrow(
        "Failed to read file as data URL",
      );
    });
  });

  describe("scanLabelImage", () => {
    it("rejects non-image files", async () => {
      const file = new File(["x"], "a.txt", { type: "text/plain" });
      await expect(scanLabelImage(file, "tok")).rejects.toThrow(
        "Please select a valid image file",
      );
    });

    it("uploads and maps the response", async () => {
      let auth: string | null = null;
      server.use(
        http.post("/labeller/upload", ({ request }) => {
          auth = request.headers.get("Authorization");
          return HttpResponse.json({
            image: {
              description: "Bar",
              calories: 210,
              total_fat_grams: 8,
              cholesterol_mg: 15,
              protein_g: 6,
            },
          });
        }),
      );

      const result = await scanLabelImage(imageFile(), "tok");

      expect(auth).toBe("Bearer tok");
      expect(result).toMatchObject({
        description: "Bar",
        calories: 210,
        totalFatGrams: 8,
        cholesterolMilligrams: 15,
        proteinGrams: 6,
        sodiumMilligrams: 0,
      });
    });

    it("defaults a non-string description to empty", async () => {
      server.use(
        http.post("/labeller/upload", () =>
          HttpResponse.json({ image: { description: 5 } }),
        ),
      );
      expect((await scanLabelImage(imageFile(), "tok")).description).toBe("");
    });

    it("retries failed uploads then gives up", async () => {
      let calls = 0;
      server.use(
        http.post("/labeller/upload", () => {
          calls += 1;
          return new HttpResponse(null, { status: 500 });
        }),
      );
      await expect(scanLabelImage(imageFile(), "tok")).rejects.toThrow(
        "Too many retries",
      );
      expect(calls).toBe(3);
    });
  });
});
