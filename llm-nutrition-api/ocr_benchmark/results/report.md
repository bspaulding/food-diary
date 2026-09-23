# OCR Frontend Benchmark Report

## Ranked (best to worst, by overall field accuracy)

| Rank | Frontend | Field Accuracy | Exact-Match Cases | Cases Run | OCR errors | Extract errors |
|---|---|---|---|---|---|---|
| 1 | PaddleOCR-mobile (PP-OCRv4) | 36.7% | 0.0% | 89 | 0 | 79 |

## Frontends that failed to run at all

- **got_ocr2**: ModuleNotFoundError: No module named 'torch'
- **smolvlm2**: ModuleNotFoundError: No module named 'torch'
- **florence2**: ModuleNotFoundError: No module named 'torch'
- **moondream2**: ModuleNotFoundError: No module named 'torch'

## Per-frontend detail

### PaddleOCR-mobile (PP-OCRv4)

- Overall field accuracy: 36.7% (55/150 fields)
- Exact-match case rate: 0.0% (0/10 cases)
- OCR latency: mean 14.88s, median 13.63s
- Extraction latency: mean 4.27s, median 4.00s
- Errors: 0 OCR, 79 extraction

| Field | Accuracy |
|---|---|
| servings_per_container | 40.0% |
| serving_size_grams | 20.0% |
| calories | 50.0% |
| total_fat_grams | 0.0% |
| saturated_fat_grams | 30.0% |
| trans_fat_grams | 70.0% |
| polyunsaturated_fat_grams | 70.0% |
| monounsaturated_fat_grams | 70.0% |
| cholesterol_mg | 40.0% |
| sodium_mg | 0.0% |
| total_carbohydrates_g | 20.0% |
| dietary_fiber_g | 20.0% |
| total_sugars_g | 40.0% |
| added_sugars_g | 80.0% |
| protein_g | 0.0% |

<details><summary>Errors (first 10)</summary>

- IMG_5437_1200.png: needle.extract returned None (no match)
- IMG_5421_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: serving_size_grams, servings_per_container
- IMG_5423_1200.png: needle.extract returned None (no match)
- IMG_5422_1200.png: needle.extract returned None (no match)
- IMG_5436_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: added_sugars_g, calories, protein_g, saturated_fat_grams, total_carbohydrates_g, total_fat_grams, total_sugars_g, trans_fat_grams
- IMG_5432_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: calories, cholesterol_mg, monounsaturated_fat_grams, serving_size_grams, servings_per_container, sodium_mg, total_carbohydrates_g, total_fat_grams, total_sugars_g
- IMG_5426_1200.png: ExtractionValidationError: extraction returned values not grounded in the input: added_sugars_g, calories, cholesterol_mg, dietary_fiber_g, monounsaturated_fat_grams, polyunsaturated_fat_grams, protein_g, saturated_fat_grams, serving_size_grams, servings_per_container, sodium_mg, total_carbohydrates_g, total_fat_grams, total_sugars_g, trans_fat_grams
- IMG_5427_1200.png: needle.extract returned None (no match)
- IMG_5425_1200.png: needle.extract returned None (no match)
- IMG_5419_1200.png: needle.extract returned None (no match)

</details>

## Likely schema/ground-truth issues

None found.
