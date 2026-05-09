import type { Component, Accessor, Setter } from "solid-js";
import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { NutritionItem, NutritionItemAttrs } from "./Api";
import { createNutritionItem, updateNutritionItem } from "./Api";
import { useAuth } from "./Auth0";
import { accessorsToObject } from "./Util";
import styles from "./NewNutritionItemForm.module.css";
import CameraModal from "./CameraModal";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const fromTextInput =
  (setter: Setter<string>) =>
  (event: InputEvent & { target: HTMLInputElement }) => {
    setter(event.target.value || "");
  };

const fromNumberInput =
  (setter: Setter<number>) =>
  (event: InputEvent & { target: HTMLInputElement }) => {
    const parsed = parseFloat(event.target.value);
    if (!isNaN(parsed)) {
      setter(parsed);
    }
  };

type Props = {
  onSaved?: (id: number) => void;
  initialItem?: NutritionItem;
};

const NewNutritionItemForm: Component<Props> = ({
  onSaved,
  initialItem,
}: Props) => {
  const [{ accessToken }] = useAuth();
  const [disabled, setDisabled] = createSignal(false);
  const [showCameraModal, setShowCameraModal] = createSignal(false);
  const navigate = useNavigate();

  const [id, _setId] = createSignal(initialItem?.id);
  const [description, setDescription] = createSignal(
    initialItem?.description || "",
  );
  const [calories, setCalories] = createSignal(initialItem?.calories || 0);
  const [totalFatGrams, setTotalFatGrams] = createSignal(
    initialItem?.totalFatGrams || 0,
  );
  const [saturatedFatGrams, setSaturatedFatGrams] = createSignal(
    initialItem?.saturatedFatGrams || 0,
  );
  const [transFatGrams, setTransFatGrams] = createSignal(
    initialItem?.transFatGrams || 0,
  );
  const [polyunsaturatedFatGrams, setPolyunsaturatedFatGrams] = createSignal(
    initialItem?.polyunsaturatedFatGrams || 0,
  );
  const [monounsaturatedFatGrams, setMonounsaturatedFatGrams] = createSignal(
    initialItem?.monounsaturatedFatGrams || 0,
  );
  const [cholesterolMilligrams, setCholesterolMilligrams] = createSignal(
    initialItem?.cholesterolMilligrams || 0,
  );
  const [sodiumMilligrams, setSodiumMilligrams] = createSignal(
    initialItem?.sodiumMilligrams || 0,
  );
  const [totalCarbohydrateGrams, setTotalCarbohydrateGrams] = createSignal(
    initialItem?.totalCarbohydrateGrams || 0,
  );
  const [dietaryFiberGrams, setDietaryFiberGrams] = createSignal(
    initialItem?.dietaryFiberGrams || 0,
  );
  const [totalSugarsGrams, setTotalSugarsGrams] = createSignal(
    initialItem?.totalSugarsGrams || 0,
  );
  const [addedSugarsGrams, setAddedSugarsGrams] = createSignal(
    initialItem?.addedSugarsGrams || 0,
  );
  const [proteinGrams, setProteinGrams] = createSignal(
    initialItem?.proteinGrams || 0,
  );

  const item = (): NutritionItem => {
    const result = accessorsToObject({
      id,
      description,
      calories,
      totalFatGrams,
      saturatedFatGrams,
      transFatGrams,
      polyunsaturatedFatGrams,
      monounsaturatedFatGrams,
      cholesterolMilligrams,
      sodiumMilligrams,
      totalCarbohydrateGrams,
      dietaryFiberGrams,
      totalSugarsGrams,
      addedSugarsGrams,
      proteinGrams,
    });
    return result as NutritionItem;
  };

  const handleImport = (nutritionData: Partial<NutritionItemAttrs>): void => {
    if (nutritionData.description !== undefined)
      setDescription(nutritionData.description);
    if (nutritionData.calories !== undefined)
      setCalories(nutritionData.calories);
    if (nutritionData.totalFatGrams !== undefined)
      setTotalFatGrams(nutritionData.totalFatGrams);
    if (nutritionData.saturatedFatGrams !== undefined)
      setSaturatedFatGrams(nutritionData.saturatedFatGrams);
    if (nutritionData.transFatGrams !== undefined)
      setTransFatGrams(nutritionData.transFatGrams);
    if (nutritionData.polyunsaturatedFatGrams !== undefined)
      setPolyunsaturatedFatGrams(nutritionData.polyunsaturatedFatGrams);
    if (nutritionData.monounsaturatedFatGrams !== undefined)
      setMonounsaturatedFatGrams(nutritionData.monounsaturatedFatGrams);
    if (nutritionData.cholesterolMilligrams !== undefined)
      setCholesterolMilligrams(nutritionData.cholesterolMilligrams);
    if (nutritionData.sodiumMilligrams !== undefined)
      setSodiumMilligrams(nutritionData.sodiumMilligrams);
    if (nutritionData.totalCarbohydrateGrams !== undefined)
      setTotalCarbohydrateGrams(nutritionData.totalCarbohydrateGrams);
    if (nutritionData.dietaryFiberGrams !== undefined)
      setDietaryFiberGrams(nutritionData.dietaryFiberGrams);
    if (nutritionData.totalSugarsGrams !== undefined)
      setTotalSugarsGrams(nutritionData.totalSugarsGrams);
    if (nutritionData.addedSugarsGrams !== undefined)
      setAddedSugarsGrams(nutritionData.addedSugarsGrams);
    if (nutritionData.proteinGrams !== undefined)
      setProteinGrams(nutritionData.proteinGrams);
  };

  return (
    <>
      <Show when={showCameraModal()}>
        <CameraModal
          isOpen={showCameraModal()}
          onClose={() => setShowCameraModal(false)}
          onImport={handleImport}
          accessToken={accessToken()}
        />
      </Show>
      <div class="flex justify-end mb-2">
        <button
          type="button"
          class="bg-indigo-600 text-slate-50 py-2 px-4 rounded-md flex items-center gap-2"
          onClick={() => setShowCameraModal(true)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="w-5 h-5"
          >
            <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
            <path
              fill-rule="evenodd"
              d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Zm12-1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clip-rule="evenodd"
            />
          </svg>
          Scan
        </button>
      </div>
      <form class={styles.form}>
        <fieldset class="flex flex-col">
          <label for="description">Description</label>
          <input
            type="text"
            name="description"
            disabled={disabled()}
            value={description()}
            onInput={fromTextInput(setDescription)}
          />
        </fieldset>
        <fieldset class="flex flex-col my-4">
          <legend class="font-semibold">Nutrition Facts</legend>

          <label for="calories">Calories</label>
          <input
            type="number"
            step="0.1"
            name="calories"
            disabled={disabled()}
            value={calories()}
            onInput={fromNumberInput(setCalories)}
          />

          <label for="total-fat-grams">Total Fat (g)</label>
          <input
            type="number"
            step="0.1"
            name="total-fat-grams"
            disabled={disabled()}
            value={totalFatGrams()}
            onInput={fromNumberInput(setTotalFatGrams)}
          />

          <label for="saturated-fat-grams">Saturated Fat (g)</label>
          <input
            type="number"
            step="0.1"
            name="saturated-fat-grams"
            disabled={disabled()}
            value={saturatedFatGrams()}
            onInput={fromNumberInput(setSaturatedFatGrams)}
          />

          <label for="trans-fat-grams">Trans Fat (g)</label>
          <input
            type="number"
            step="0.1"
            name="trans-fat-grams"
            disabled={disabled()}
            value={transFatGrams()}
            onInput={fromNumberInput(setTransFatGrams)}
          />

          <label for="polyunsaturated-fat-grams">Polyunsaturated Fat (g)</label>
          <input
            type="number"
            step="0.1"
            name="polyunsaturated-fat-grams"
            disabled={disabled()}
            value={polyunsaturatedFatGrams()}
            onInput={fromNumberInput(setPolyunsaturatedFatGrams)}
          />

          <label for="monounsaturated-fat-grams">Monounsaturated Fat (g)</label>
          <input
            type="number"
            step="0.1"
            name="monounsaturated-fat-grams"
            disabled={disabled()}
            value={monounsaturatedFatGrams()}
            onInput={fromNumberInput(setMonounsaturatedFatGrams)}
          />

          <label for="cholesterol-milligrams">Cholesterol (mg)</label>
          <input
            type="number"
            step="0.1"
            name="cholesterol-milligrams"
            disabled={disabled()}
            value={cholesterolMilligrams()}
            onInput={fromNumberInput(setCholesterolMilligrams)}
          />

          <label for="sodium-milligrams">Sodium (mg)</label>
          <input
            type="number"
            step="0.1"
            name="sodium-milligrams"
            disabled={disabled()}
            value={sodiumMilligrams()}
            onInput={fromNumberInput(setSodiumMilligrams)}
          />

          <label for="total-carbohydrate-grams">Total Carbohydrate (g)</label>
          <input
            type="number"
            step="0.1"
            name="total-carbohydrate-grams"
            disabled={disabled()}
            value={totalCarbohydrateGrams()}
            onInput={fromNumberInput(setTotalCarbohydrateGrams)}
          />

          <label for="dietary-fiber-grams">Dietary Fiber (g)</label>
          <input
            type="number"
            step="0.1"
            name="dietary-fiber-grams"
            disabled={disabled()}
            value={dietaryFiberGrams()}
            onInput={fromNumberInput(setDietaryFiberGrams)}
          />

          <label for="total-sugars-grams">Total Sugars (g)</label>
          <input
            type="number"
            step="0.1"
            name="total-sugars-grams"
            disabled={disabled()}
            value={totalSugarsGrams()}
            onInput={fromNumberInput(setTotalSugarsGrams)}
          />

          <label for="added-sugars-grams">Added Sugars (g)</label>
          <input
            type="number"
            step="0.1"
            name="added-sugars-grams"
            disabled={disabled()}
            value={addedSugarsGrams()}
            onInput={fromNumberInput(setAddedSugarsGrams)}
          />

          <label for="protein-grams">Protein (g)</label>
          <input
            type="number"
            step="0.1"
            name="protein-grams"
            disabled={disabled()}
            value={proteinGrams()}
            onInput={fromNumberInput(setProteinGrams)}
          />
        </fieldset>
        <fieldset class="mb-4">
          <button
            type="button"
            class="bg-indigo-600 text-slate-50 py-3 w-full text-xl font-semibold"
            disabled={disabled()}
            onClick={async (event) => {
              event.preventDefault();
              const itemData: NutritionItem = item();
              const id: number | undefined = await saveItem(
                accessToken(),
                setDisabled,
                {
                  ...itemData,
                  id: itemData.id || 0,
                } as NutritionItem,
              );
              if (!onSaved) {
                navigate(`/nutrition_item/${id}`);
              }
            }}
          >
            {disabled() ? "Saving..." : "Save"}
          </button>
        </fieldset>
      </form>
    </>
  );
};

export default NewNutritionItemForm;

const saveItem = async (
  accessToken: string,
  setLoading: Setter<boolean>,
  item: NutritionItem,
): Promise<number | undefined> => {
  setLoading(true);
  if (item.id) {
    const response: GraphQLResponse<{
      update_food_diary_nutrition_item_by_pk: { id: number };
    }> = await updateNutritionItem(accessToken, item);
    const id: number | undefined =
      response.data?.update_food_diary_nutrition_item_by_pk.id;
    return id;
  } else {
    const response: GraphQLResponse<{
      insert_food_diary_nutrition_item_one: { id: number };
    }> = await createNutritionItem(accessToken, item);
    const id: number | undefined =
      response.data?.insert_food_diary_nutrition_item_one.id;
    return id;
  }
};
