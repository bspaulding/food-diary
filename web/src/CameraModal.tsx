import type { Component } from "solid-js";
import { createSignal, createEffect, onCleanup, on } from "solid-js";
import type { NutritionItemAttrs } from "./Api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (nutritionData: Partial<NutritionItemAttrs>) => void;
  accessToken: string;
};

// Helper to get a numeric value from API response, supporting both camelCase and snake_case keys
const getNumericValue = (
  data: Record<string, unknown>,
  key: string,
): number => {
  const value = data[key];
  return typeof value === "number" ? value : 0;
};

// Image processing constants
const MAX_IMAGE_SIZE = 1080;
const JPEG_QUALITY = 0.95;

const CameraModal: Component<Props> = (props: Props) => {
  let videoRef: HTMLVideoElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let streamRef: MediaStream | null = null;
  const [capturedImage, setCapturedImage] = createSignal<Blob | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = createSignal<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<"camera" | "upload">("camera");

  const startCamera = async (): Promise<void> => {
    try {
      const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef = stream;
      if (videoRef) {
        videoRef.srcObject = stream;
      }
    } catch (err: unknown) {
      let errorMessage: string = "Unable to access camera.";
      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          errorMessage =
            "Camera permission was denied. Please allow camera access to scan nutrition labels.";
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          errorMessage =
            "No camera found. Please ensure your device has a camera.";
        } else if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          errorMessage =
            "Camera is in use by another application. Please close other apps using the camera.";
        }
      }
      setError(errorMessage);
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = (): void => {
    if (streamRef) {
      streamRef.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef = null;
    }
  };

  // Use createEffect to watch for isOpen changes
  createEffect(() => {
    if (props.isOpen && mode() === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
  });

  onCleanup(() => {
    stopCamera();
    // Clean up object URL to prevent memory leaks
    const url = capturedImageUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  });

  // Create effect to manage object URL lifecycle
  createEffect(
    on(capturedImage, (image: Blob | null) => {
      // Revoke previous URL if it existed
      const prevUrl: string | null = capturedImageUrl();
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }

      // Create new URL if there's an image
      if (image) {
        const newUrl: string = URL.createObjectURL(image);
        setCapturedImageUrl(newUrl);
      } else {
        setCapturedImageUrl(null);
      }
    }),
  );

  const handleFileSelect = async (event: Event): Promise<void> => {
    const input: HTMLInputElement | null =
      event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    const file: File | undefined = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      input.value = "";
      return;
    }

    try {
      // Convert and resize the image
      const resizedBlob: Blob = await resizeImage(file);
      setCapturedImage(resizedBlob);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to process image");
      console.error("Error processing image:", err);
    }

    // Reset input to allow selecting the same file again
    input.value = "";
  };

  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise(
      (resolve: (value: Blob) => void, reject: (reason: Error) => void) => {
        const reader: FileReader = new FileReader();

        reader.onload = (e: ProgressEvent<FileReader>): void => {
          const dataUrl: string | undefined =
            typeof e.target?.result === "string" ? e.target.result : undefined;
          if (!dataUrl) {
            reject(new Error("Failed to read file as data URL"));
            return;
          }

          // Create an img element with the data URL
          const img: HTMLImageElement = new Image();

          img.onload = (): void => {
            try {
              // Calculate dimensions with max constraint
              let width: number = img.width;
              let height: number = img.height;

              if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
                if (width > height) {
                  height = (height / width) * MAX_IMAGE_SIZE;
                  width = MAX_IMAGE_SIZE;
                } else {
                  width = (width / height) * MAX_IMAGE_SIZE;
                  height = MAX_IMAGE_SIZE;
                }
              }

              // Create canvas and draw the resized image
              const canvas: HTMLCanvasElement =
                document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx: CanvasRenderingContext2D | null =
                canvas.getContext("2d");

              if (!ctx) {
                reject(new Error("Failed to get canvas context"));
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);

              // Export as JPEG
              canvas.toBlob(
                (blob: Blob | null): void => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(new Error("Failed to create blob from canvas"));
                  }
                },
                "image/jpeg",
                JPEG_QUALITY,
              );
            } catch (err: unknown) {
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          };

          img.onerror = (): void => {
            reject(new Error("Failed to load image"));
          };

          img.src = dataUrl;
        };

        reader.onerror = (): void => {
          reject(new Error("Failed to read file"));
        };

        reader.readAsDataURL(file);
      },
    );
  };

  const uploadImage = async (imageBlob: Blob): Promise<void> => {
    setIsUploading(true);
    setError(null);

    try {
      // Create form data and upload
      const formData: FormData = new FormData();
      formData.append("image", imageBlob, "capture.jpg");

      async function retry(
        times: number,
        fn: () => Promise<Response>,
      ): Promise<Response> {
        let i: number = 0;
        let result: Response | unknown;
        while (i < times) {
          try {
            result = await fn();
            if (result instanceof Response) {
              return result;
            }
            throw new Error("Expected Response object");
          } catch (e: unknown) {
            result = e;
          }
          i++;
        }
        if (i >= times) {
          throw new Error(`Too many retries. Last result was ${result}.`);
        }

        throw new Error("Retry logic error");
      }

      const response: Response = await retry(3, async (): Promise<Response> => {
        const response: Response = await fetch("/labeller/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${props.accessToken}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        return response;
      });

      const { image: data }: { image: Record<string, unknown> } =
        await response.json();

      // Map the response to nutrition item attributes
      const nutritionData: Partial<NutritionItemAttrs> = {
        description:
          typeof data.description === "string" ? data.description : "",
        calories: getNumericValue(data, "calories"),
        totalFatGrams: getNumericValue(data, "total_fat_grams"),
        cholesterolMilligrams: getNumericValue(data, "cholesterol_mg"),
        sodiumMilligrams: getNumericValue(data, "sodium_mg"),
        totalCarbohydrateGrams: getNumericValue(data, "total_carbohydrates_g"),
        dietaryFiberGrams: getNumericValue(data, "dietary_fiber_g"),
        totalSugarsGrams: getNumericValue(data, "total_sugars_g"),
        addedSugarsGrams: getNumericValue(data, "added_sugars_g"),
        proteinGrams: getNumericValue(data, "protein_g"),
      };

      props.onImport(nutritionData);
      stopCamera();
      props.onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
      console.error("Error uploading image:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const captureAndUpload = async (): Promise<void> => {
    if (!videoRef || !canvasRef) return;

    try {
      // Draw the current video frame to the canvas
      const context: CanvasRenderingContext2D | null =
        canvasRef.getContext("2d");
      if (!context) {
        throw new Error("Could not get canvas context");
      }

      canvasRef.width = videoRef.videoWidth;
      canvasRef.height = videoRef.videoHeight;
      context.drawImage(videoRef, 0, 0);

      // Convert canvas to blob
      const blob: Blob = await new Promise<Blob>(
        (resolve: (value: Blob) => void, reject: (reason: Error) => void) => {
          const canvas: HTMLCanvasElement | undefined = canvasRef;
          if (!canvas) {
            reject(new Error("Canvas ref not available"));
            return;
          }
          canvas.toBlob(
            (blob: Blob | null): void => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to create image blob"));
              }
            },
            "image/jpeg",
            0.95,
          );
        },
      );

      setCapturedImage(blob);
      await uploadImage(blob);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to capture image");
      console.error("Error capturing image:", err);
    }
  };

  const handleUploadClick = async (): Promise<void> => {
    const image: Blob | null = capturedImage();
    if (image) {
      await uploadImage(image);
    }
  };

  const handleClose = (): void => {
    stopCamera();
    setCapturedImage(null);
    setMode("camera");
    props.onClose();
  };

  if (!props.isOpen) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div class="relative w-full h-full flex flex-col bg-black">
        {/* Header */}
        <div class="flex justify-between items-center p-4 bg-slate-800">
          <h2 class="text-white text-lg font-semibold">Scan Nutrition Label</h2>
          <button
            class="text-white text-2xl"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Mode Selection Tabs */}
        <div class="flex bg-slate-700">
          <button
            class={`flex-1 py-3 px-4 font-semibold ${
              mode() === "camera"
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-600"
            }`}
            onClick={() => {
              setCapturedImage(null);
              setError(null);
              setMode("camera");
            }}
          >
            Take Picture
          </button>
          <button
            class={`flex-1 py-3 px-4 font-semibold ${
              mode() === "upload"
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-600"
            }`}
            onClick={() => {
              setMode("upload");
              stopCamera();
              setCapturedImage(null);
              setError(null);
            }}
          >
            Upload Image
          </button>
        </div>

        {/* Camera View or File Upload */}
        <div class="flex-1 flex items-center justify-center overflow-hidden">
          {error() ? (
            <p class="text-red-500 text-center px-4">{error()}</p>
          ) : capturedImageUrl() ? (
            <img
              src={capturedImageUrl() ?? ""}
              class="max-w-full max-h-full object-contain"
            />
          ) : mode() === "camera" ? (
            <video
              ref={videoRef}
              autoplay
              playsinline
              class="max-w-full max-h-full object-contain"
            />
          ) : (
            <div class="flex flex-col items-center justify-center gap-4 p-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="w-24 h-24 text-slate-600"
              >
                <path
                  fill-rule="evenodd"
                  d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
                  clip-rule="evenodd"
                />
              </svg>
              <p class="text-slate-400 text-center">
                Choose an image file to scan
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                class="hidden"
                onChange={handleFileSelect}
              />
              <button
                class="bg-indigo-600 text-white py-2 px-6 rounded-lg font-semibold"
                onClick={() => fileInputRef?.click()}
              >
                Choose File
              </button>
            </div>
          )}
          <canvas ref={canvasRef} class="hidden" />
        </div>

        {/* Footer with Import Button */}
        <div class="p-4 bg-slate-800 flex justify-center">
          {mode() === "camera" && !capturedImage() ? (
            <button
              class="bg-indigo-600 text-white py-3 px-6 text-lg font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50"
              onClick={captureAndUpload}
              disabled={isUploading() || !!error()}
            >
              {isUploading() ? (
                "Uploading..."
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="w-6 h-6"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10.5 3.75a6 6 0 0 0-5.98 6.496A5.25 5.25 0 0 0 6.75 20.25H18a4.5 4.5 0 0 0 2.206-8.423 3.75 3.75 0 0 0-4.133-4.303A6.001 6.001 0 0 0 10.5 3.75Zm2.03 5.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.72-1.72v4.94a.75.75 0 0 0 1.5 0v-4.94l1.72 1.72a.75.75 0 1 0 1.06-1.06l-3-3Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Capture & Import
                </>
              )}
            </button>
          ) : capturedImage() ? (
            <button
              class="bg-indigo-600 text-white py-3 px-6 text-lg font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50"
              onClick={handleUploadClick}
              disabled={isUploading() || !!error()}
            >
              {isUploading() ? (
                "Uploading..."
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="w-6 h-6"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10.5 3.75a6 6 0 0 0-5.98 6.496A5.25 5.25 0 0 0 6.75 20.25H18a4.5 4.5 0 0 0 2.206-8.423 3.75 3.75 0 0 0-4.133-4.303A6.001 6.001 0 0 0 10.5 3.75Zm2.03 5.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.72-1.72v4.94a.75.75 0 0 0 1.5 0v-4.94l1.72 1.72a.75.75 0 1 0 1.06-1.06l-3-3Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Import Label
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
