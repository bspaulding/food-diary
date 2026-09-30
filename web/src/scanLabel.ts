import type { NutritionItemAttrs } from "./Api";

const MAX_IMAGE_SIZE = 1080;
const JPEG_QUALITY = 0.95;

const getNumericValue = (
  data: Record<string, unknown>,
  key: string,
): number => {
  const value = data[key];
  return typeof value === "number" ? value : 0;
};

export const resizeImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const dataUrl =
        typeof e.target?.result === "string" ? e.target.result : undefined;
      if (!dataUrl) {
        reject(new Error("Failed to read file as data URL"));
        return;
      }

      const img = new Image();

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
            if (width > height) {
              height = (height / width) * MAX_IMAGE_SIZE;
              width = MAX_IMAGE_SIZE;
            } else {
              width = (width / height) * MAX_IMAGE_SIZE;
              height = MAX_IMAGE_SIZE;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
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

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const uploadWithRetry = async (
  times: number,
  accessToken: string,
  body: FormData,
): Promise<Response> => {
  let lastError: unknown;
  for (let i = 0; i < times; i++) {
    try {
      const response = await fetch("/labeller/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      return response;
    } catch (e: unknown) {
      lastError = e;
    }
  }
  throw new Error(`Too many retries. Last result was ${lastError}.`);
};

export const scanLabelImage = async (
  file: File,
  accessToken: string,
): Promise<Partial<NutritionItemAttrs>> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file");
  }

  const blob = await resizeImage(file);
  const formData = new FormData();
  formData.append("image", blob, "capture.jpg");

  const response = await uploadWithRetry(3, accessToken, formData);
  const { image: data }: { image: Record<string, unknown> } =
    await response.json();

  return {
    description: typeof data.description === "string" ? data.description : "",
    calories: getNumericValue(data, "calories"),
    totalFatGrams: getNumericValue(data, "total_fat_grams"),
    saturatedFatGrams: getNumericValue(data, "saturated_fat_grams"),
    transFatGrams: getNumericValue(data, "trans_fat_grams"),
    polyunsaturatedFatGrams: getNumericValue(data, "polyunsaturated_fat_grams"),
    monounsaturatedFatGrams: getNumericValue(data, "monounsaturated_fat_grams"),
    cholesterolMilligrams: getNumericValue(data, "cholesterol_mg"),
    sodiumMilligrams: getNumericValue(data, "sodium_mg"),
    totalCarbohydrateGrams: getNumericValue(data, "total_carbohydrates_g"),
    dietaryFiberGrams: getNumericValue(data, "dietary_fiber_g"),
    totalSugarsGrams: getNumericValue(data, "total_sugars_g"),
    addedSugarsGrams: getNumericValue(data, "added_sugars_g"),
    proteinGrams: getNumericValue(data, "protein_g"),
  };
};
