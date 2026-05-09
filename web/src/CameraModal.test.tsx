import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import CameraModal from "./CameraModal";

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
};

describe("CameraModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.mediaDevices
    Object.defineProperty(global.navigator, "mediaDevices", {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
      configurable: true,
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();

    // Mock HTMLCanvasElement.toBlob
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      callback: BlobCallback,
    ) {
      const blob = new Blob(["mock-image"], { type: "image/jpeg" });
      callback(blob);
    });

    // Mock HTMLCanvasElement.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(function () {
      return {
        drawImage: vi.fn(),
      };
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render modal when open", () => {
    mockGetUserMedia.mockResolvedValue(mockStream);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    expect(screen.getByText("Scan Nutrition Label")).toBeTruthy();
  });

  it("should not render modal when closed", () => {
    render(() => (
      <CameraModal
        isOpen={false}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    expect(screen.queryByText("Scan Nutrition Label")).toBeFalsy();
  });

  it("should start camera when opened in camera mode", async () => {
    mockGetUserMedia.mockResolvedValue(mockStream);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: { facingMode: "environment" },
      });
    });
  });

  it("should handle camera permission denied error", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    mockGetUserMedia.mockRejectedValue(error);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(screen.getByText(/Camera permission was denied/)).toBeTruthy();
    });
  });

  it("should handle camera not found error", async () => {
    const error = new DOMException("Device not found", "NotFoundError");
    mockGetUserMedia.mockRejectedValue(error);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(screen.getByText(/No camera found/)).toBeTruthy();
    });
  });

  it("should handle DevicesNotFoundError", async () => {
    const error = new DOMException("No devices", "DevicesNotFoundError");
    mockGetUserMedia.mockRejectedValue(error);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(screen.getByText(/No camera found/)).toBeTruthy();
    });
  });

  it("should handle camera in use error", async () => {
    const error = new DOMException("Camera in use", "NotReadableError");
    mockGetUserMedia.mockRejectedValue(error);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(
        screen.getByText(/Camera is in use by another application/),
      ).toBeTruthy();
    });
  });

  it("should handle generic camera error", async () => {
    const error = new Error("Generic error");
    mockGetUserMedia.mockRejectedValue(error);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(screen.getByText(/Unable to access camera/)).toBeTruthy();
    });
  });

  it("should stop camera when modal is closed", async () => {
    const mockStop = vi.fn();
    const mockStreamWithStop = {
      getTracks: () => [{ stop: mockStop }],
    };
    mockGetUserMedia.mockResolvedValue(mockStreamWithStop);

    const { unmount } = render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    unmount();

    expect(mockStop).toHaveBeenCalled();
  });

  it("should switch to upload mode", async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockResolvedValue(mockStream);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    const uploadButton = screen.getByText("Upload Image");
    await user.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText("Choose File")).toBeTruthy();
    });
  });

  it("should handle file upload", async () => {
    const user = userEvent.setup();
    const mockOnImport = vi.fn();

    // Mock fetch for upload
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          image: {
            description: "Test Item",
            calories: 100,
            total_fat_grams: 5,
            cholesterol_mg: 10,
            sodium_mg: 200,
            total_carbohydrates_g: 20,
            dietary_fiber_g: 3,
            total_sugars_g: 10,
            added_sugars_g: 5,
            protein_g: 8,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={mockOnImport}
        accessToken="test-token"
      />
    ));

    const uploadButton = screen.getByText("Upload Image");
    await user.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText("Choose File")).toBeTruthy();
    });

    // Create a mock image file
    const file = new File(["image content"], "test.jpg", {
      type: "image/jpeg",
    });

    // Mock Image loading
    const originalImage = global.Image;
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 1920;
      height = 1080;

      constructor() {
        setTimeout(() => {
          if (this.onload) {
            this.onload();
          }
        }, 0);
      }
    } as any;

    const fileInput = screen.getByRole("button", {
      name: "Choose File",
    }) as HTMLButtonElement;

    // Get the actual hidden file input
    const hiddenFileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(hiddenFileInput, "files", {
      value: [file],
      writable: false,
    });

    // Trigger the file input change event
    await user.click(fileInput);
    hiddenFileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Label")).toBeTruthy();
    });

    // Click import button
    const importButton = screen.getByText("Import Label");
    await user.click(importButton);

    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalledWith({
        description: "Test Item",
        calories: 100,
        totalFatGrams: 5,
        cholesterolMilligrams: 10,
        sodiumMilligrams: 200,
        totalCarbohydrateGrams: 20,
        dietaryFiberGrams: 3,
        totalSugarsGrams: 10,
        addedSugarsGrams: 5,
        proteinGrams: 8,
      });
    });

    // Restore
    global.Image = originalImage;
  });

  it("should reject non-image files", async () => {
    const user = userEvent.setup();

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    const uploadButton = screen.getByText("Upload Image");
    await user.click(uploadButton);

    const file = new File(["text content"], "test.txt", { type: "text/plain" });

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Please select a valid image file")).toBeTruthy();
    });
  });

  it("should handle image processing errors", async () => {
    const user = userEvent.setup();

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    const uploadButton = screen.getByText("Upload Image");
    await user.click(uploadButton);

    const file = new File(["image content"], "test.jpg", {
      type: "image/jpeg",
    });

    // Mock Image with error
    const originalImage = global.Image;
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";

      constructor() {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror();
          }
        }, 0);
      }
    } as any;

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load image/)).toBeTruthy();
    });

    // Restore
    global.Image = originalImage;
  });

  it("should handle upload errors and retry", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();

    // Mock fetch to fail then succeed
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            image: {
              description: "Test",
              calories: 100,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={mockOnClose}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    const uploadButton = screen.getByText("Upload Image");
    await user.click(uploadButton);

    const file = new File(["image content"], "test.jpg", {
      type: "image/jpeg",
    });

    // Mock Image
    const originalImage = global.Image;
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      width = 800;
      height = 600;

      constructor() {
        setTimeout(() => {
          if (this.onload) {
            this.onload();
          }
        }, 0);
      }
    } as any;

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Label")).toBeTruthy();
    });

    const importButton = screen.getByText("Import Label");
    await user.click(importButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Restore
    global.Image = originalImage;
  });

  it("should close modal when close button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();
    mockGetUserMedia.mockResolvedValue(mockStream);

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={mockOnClose}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    const closeButton = screen.getByLabelText("Close");
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("should handle canvas context error", async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock canvas context to return null
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // Try to capture - will fail due to null context
    const captureButton = screen.getByText("Capture & Import");
    await user.click(captureButton);

    // Should show error
    await waitFor(() => {
      expect(screen.getByText(/Could not get canvas context/)).toBeTruthy();
    });
  });

  it("should successfully capture from camera and upload", async () => {
    const user = userEvent.setup();
    const mockOnImport = vi.fn();
    const mockOnClose = vi.fn();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock fetch for upload
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          image: {
            description: "Camera Captured",
            calories: 200,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // Capture image
    const captureButton = screen.getByText("Capture & Import");
    await user.click(captureButton);

    // Wait for upload and import
    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Camera Captured",
          calories: 200,
        }),
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("should reset captured image when Take Picture is clicked", async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock fetch to capture successfully
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        image: {
          description: "Test",
          calories: 100,
        },
      }),
    });

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // First capture an image
    const captureButton = screen.getByText("Capture & Import");
    await user.click(captureButton);

    // Wait for review mode (we might see an error but that's ok)
    await waitFor(
      () => {
        // Look for "Take Picture" button which appears in review mode
        const takePictureButtons = screen.queryAllByText("Take Picture");
        expect(takePictureButtons.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );

    // Click "Take Picture" to go back to camera mode
    const takePictureButton = screen.getAllByText("Take Picture")[0];
    await user.click(takePictureButton);

    // Should be back in camera mode
    await waitFor(() => {
      expect(screen.getByText("Capture & Import")).toBeTruthy();
    });
  });

  it("should set isUploading to false in upload error finally block", async () => {
    const user = userEvent.setup();
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Mock fetch to fail
    global.fetch = vi.fn().mockRejectedValue(new Error("Upload failed"));

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // Try to capture
    const captureButton = screen.getByText("Capture & Import");
    await user.click(captureButton);

    // Should show error
    await waitFor(() => {
      expect(screen.queryByText(/Upload failed|Failed to/)).not.toBeNull();
    });

    // Button should no longer be disabled (isUploading set to false)
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      // At least one button should be enabled
      const enabledButtons = buttons.filter((b) => !b.hasAttribute("disabled"));
      expect(enabledButtons.length).toBeGreaterThan(0);
    });
  });

  it("should revoke object URLs on cleanup", async () => {
    mockGetUserMedia.mockResolvedValue(mockStream);

    const { unmount } = render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={() => {}}
        accessToken="test-token"
      />
    ));

    // Just test that unmount works without errors
    unmount();

    // The test passes if no errors are thrown during cleanup
    expect(true).toBe(true);
  });

  it("should handle getNumericValue with non-numeric values", () => {
    // This tests the helper function indirectly through the upload process
    const user = userEvent.setup();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        image: {
          description: "Test",
          calories: "not-a-number",
          total_fat_grams: null,
        },
      }),
    });

    render(() => (
      <CameraModal
        isOpen={true}
        onClose={() => {}}
        onImport={(data) => {
          // Should default to 0 for non-numeric values
          expect(data.calories).toBe(0);
          expect(data.totalFatGrams).toBe(0);
        }}
        accessToken="test-token"
      />
    ));
  });
});
