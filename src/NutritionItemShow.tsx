import type { Component } from "solid-js";
import { useParams, Link } from "@solidjs/router";
import { fetchNutritionItem } from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";

const NutritionItemShow: Component = () => {
  const params = useParams();
  const [nutritionItemQuery] = createAuthorizedResource(
    () => params.id,
    fetchNutritionItem
  );

  const nutritionItem = () =>
    nutritionItemQuery()?.data?.food_diary_nutrition_item_by_pk || {};
  return (
    <div style={{ margin: "18px" }}>
      <p>
        <Link href="/">Back to entries</Link>
      </p>
      <p>
        <Link href={`/nutrition_item/${params.id}/edit`}>Edit</Link>
      </p>
      <pre>{JSON.stringify(nutritionItem(), null, 2)}</pre>
    </div>
  );
};

export default NutritionItemShow;
