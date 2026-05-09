import type { Component } from "solid-js";
import { createSignal, Index } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Recipe, SearchNutritionItem } from "./Api";
import { createRecipe, updateRecipe } from "./Api";
import SearchItemsForm, {
  ItemsQueryType,
  ItemOrRecipe,
} from "./SearchItemsForm";
import { useAuth } from "./Auth0";
import ButtonLink from "./ButtonLink";

type Props = {
  initialRecipe?: Recipe;
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const NewRecipeForm: Component<Props> = ({ initialRecipe }: Props) => {
  const [{ accessToken }] = useAuth();
  const [input, setInput] = createSignal<Recipe>(
    initialRecipe ?? {
      id: 0,
      name: "",
      total_servings: 1,
      recipe_items: [],
    },
  );
  const navigate = useNavigate();
  return (
    <div>
      <ButtonLink href="/">Back to entries</ButtonLink>
      <h2 class="font-bold text-xl mt-4">New Recipe</h2>
      <form class="flex flex-col">
        <fieldset class="flex flex-col">
          <legend class="font-semibold">Info</legend>
          <label for="name">Name</label>
          <input
            type="text"
            name="name"
            value={input().name}
            onInput={(event: InputEvent & { target: HTMLInputElement }) => {
              setInput((input: Recipe) => ({
                ...input,
                name: event.target.value,
              }));
            }}
          />
          <label for="total-servings">Total Servings</label>
          <input
            type="number"
            name="total-servings"
            min="0"
            step="0.1"
            value={input().total_servings}
            onInput={(event: InputEvent & { target: HTMLInputElement }) => {
              const total_servings: number = parseFloat(event.target.value);
              if (isNaN(total_servings)) {
                return;
              }
              setInput((input: Recipe) => ({
                ...input,
                total_servings,
              }));
            }}
          />
        </fieldset>
        <fieldset>
          <legend class="font-semibold">Items</legend>
          <small>{input().recipe_items.length} items in recipe.</small>
          <ul>
            <Index each={input().recipe_items}>
              {(item: () => Recipe["recipe_items"][number], i: number) => (
                <li class="flex flex-row place-content-between items-center">
                  <p>{item().nutrition_item.description}</p>
                  <input
                    type="number"
                    value={item().servings}
                    min="0"
                    step="0.1"
                    class="w-20"
                    onInput={(
                      event: InputEvent & { target: HTMLInputElement },
                    ) => {
                      const servings: number = parseFloat(event.target.value);
                      if (isNaN(servings)) {
                        return;
                      }
                      setInput((input: Recipe) => ({
                        ...input,
                        recipe_items: [
                          ...input.recipe_items.slice(0, i),
                          {
                            ...item(),
                            servings,
                          },
                          ...input.recipe_items.slice(i + 1),
                        ],
                      }));
                    }}
                  />
                </li>
              )}
            </Index>
          </ul>
        </fieldset>
        <fieldset>
          <legend class="font-semibold">Add New Items</legend>
          <SearchItemsForm queryType={ItemsQueryType.ItemsOnly}>
            {({ clear, nutritionItem }: ItemOrRecipe) => (
              <li class="flex flex-row">
                <button
                  class="mr-1 text-3xl text-indigo-600 transition-transform "
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    if (!nutritionItem) return false;
                    setInput((input: Recipe) => ({
                      ...input,
                      recipe_items: [
                        ...input.recipe_items,
                        {
                          servings: 1,
                          nutrition_item: nutritionItem,
                        },
                      ],
                    }));
                    clear?.();
                    return false;
                  }}
                >
                  ⊕
                </button>
                <p>{nutritionItem?.description}</p>
              </li>
            )}
          </SearchItemsForm>
        </fieldset>
        <fieldset class="mt-4">
          <button
            class="bg-indigo-600 text-slate-50 py-3 w-full text-xl font-semibold"
            onClick={async (event: MouseEvent) => {
              event.preventDefault();
              if (input().id) {
                const response: GraphQLResponse<{
                  update_food_diary_recipe_by_pk?: { id: number };
                }> = await updateRecipe(accessToken(), input());
                const id: number | undefined =
                  response?.data?.update_food_diary_recipe_by_pk?.id;
                if (id) {
                  navigate(`/recipe/${id}`);
                }
              } else {
                const { id, ...attrs } = input();
                const response: GraphQLResponse<{
                  insert_food_diary_recipe_one?: { id: number };
                }> = await createRecipe(accessToken(), attrs);
                const responseId: number | undefined =
                  response?.data?.insert_food_diary_recipe_one?.id;
                if (responseId) {
                  navigate(`/recipe/${responseId}`);
                }
              }
              return false;
            }}
          >
            Save Recipe
          </button>
        </fieldset>
      </form>
    </div>
  );
};

export default NewRecipeForm;
