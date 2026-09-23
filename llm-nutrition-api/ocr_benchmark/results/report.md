# OCR Frontend Benchmark Report

## Ranked (best to worst, by overall field accuracy)

| Rank | Frontend | Field Accuracy | Exact-Match Cases | Cases Run | OCR errors | Extract errors |
|---|---|---|---|---|---|---|
| 1 | PaddleOCR-mobile (PP-OCRv4) | 43.6% | 0.0% | 89 | 0 | 78 |

## Per-frontend detail

### PaddleOCR-mobile (PP-OCRv4)

- Overall field accuracy: 43.6% (72/165 fields)
- Exact-match case rate: 0.0% (0/11 cases)
- OCR latency: mean 15.19s, median 13.66s
- Extraction latency: mean 4.15s, median 3.55s
- Errors: 0 OCR, 78 extraction

| Field | Accuracy |
|---|---|
| servings_per_container | 54.5% |
| serving_size_grams | 36.4% |
| calories | 63.6% |
| total_fat_grams | 0.0% |
| saturated_fat_grams | 27.3% |
| trans_fat_grams | 90.9% |
| polyunsaturated_fat_grams | 81.8% |
| monounsaturated_fat_grams | 81.8% |
| cholesterol_mg | 45.5% |
| sodium_mg | 0.0% |
| total_carbohydrates_g | 18.2% |
| dietary_fiber_g | 27.3% |
| total_sugars_g | 54.5% |
| added_sugars_g | 72.7% |
| protein_g | 0.0% |

<details><summary>Errors (first 10)</summary>

- IMG_5437_1200.png: needle.extract returned None (no match)
- IMG_5421_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: serving_size_grams, servings_per_container
- IMG_5423_1200.png: needle.extract returned None (no match)
- IMG_5422_1200.png: needle.extract returned None (no match)
- IMG_5436_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: added_sugars_g, protein_g, sodium_mg
- IMG_5432_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: serving_size_grams, servings_per_container
- IMG_5426_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: added_sugars_g, calories, cholesterol_mg, dietary_fiber_g, monounsaturated_fat_grams, polyunsaturated_fat_grams, protein_g, saturated_fat_grams, serving_size_grams, servings_per_container, sodium_mg, total_carbohydrates_g, total_fat_grams, total_sugars_g, trans_fat_grams
- IMG_5427_1200.png: needle.extract returned None (no match)
- IMG_5425_1200.png: needle.extract returned None (no match)
- IMG_5419_1200.png: needle.extract returned None (no match)

</details>

## Likely schema/ground-truth issues

None found.
