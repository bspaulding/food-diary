import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { fetchNutritionItem, NutritionItem } from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";
import NewNutritionItemForm from "./NewNutritionItemForm";

const NutritionItemEdit: Component = () => {
  const params = useParams();
  const [nutritionItemQuery] = createAuthorizedResource(
    () => params.id,
    (token: string, id: string) => fetchNutritionItem(token, id),
  );

  const nutritionItem = (): Partial<NutritionItem> =>
    nutritionItemQuery()?.data?.food_diary_nutrition_item_by_pk || {};
  return (
    <Show when={nutritionItem().id}>
      <NewNutritionItemForm initialItem={nutritionItem() as NutritionItem} />
    </Show>
  );
};

export default NutritionItemEdit;
