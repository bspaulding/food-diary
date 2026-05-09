import type { Component, JSX } from "solid-js";
import { createSignal, Index, Show, For } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import {
  searchItemsAndRecipes,
  searchItemsOnly,
  SearchNutritionItem,
  SearchRecipe,
} from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";

type ItemOrRecipe = {
  clear?: () => void;
  recipe?: SearchRecipe;
  nutritionItem?: SearchNutritionItem;
};

export type { ItemOrRecipe };

export enum ItemsQueryType {
  ItemsAndRecipes,
  ItemsOnly,
}
type Props = {
  children: (item: ItemOrRecipe) => JSX.Element;
  queryType?: ItemsQueryType;
};

const SearchItemsForm: Component<Props> = (props: Props) => {
  const [search, setSearch] = createSignal("");
  const [getItemsQuery] = createAuthorizedResource(
    search,
    (token: string, searchValue: string) => {
      return "undefined" === typeof props.queryType ||
        props.queryType === ItemsQueryType.ItemsAndRecipes
        ? searchItemsAndRecipes(token, searchValue)
        : searchItemsOnly(token, searchValue);
    },
  );
  const nutritionItems = (): SearchNutritionItem[] =>
    getItemsQuery()?.data?.food_diary_search_nutrition_items || [];
  const recipes = (): SearchRecipe[] =>
    getItemsQuery()?.data?.food_diary_search_recipes || [];
  const clear = (): string => setSearch("");

  return (
    <section class="flex flex-col mt-5">
      <input
        class="border rounded px-2 text-lg"
        type="search"
        placeholder="Search Previous Items"
        name="entry-item-search"
        onInput={debounce((event: InputEvent): void => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            setSearch(target.value);
          }
        }, 500)}
        value={search()}
      />
      <div class="px-1">
        <Show when={!search().length}>
          <p class="text-center mt-4 text-slate-400">
            Search for an item or recipe you've previously added.
          </p>
        </Show>
        <Show when={search().length}>
          <p class="text-center mt-4 text-slate-400">
            <Show when={getItemsQuery.loading}>Searching...</Show>
            <Show when={!getItemsQuery.loading}>
              {nutritionItems().length + recipes().length} items
            </Show>
          </p>
          <ul>
            <For each={nutritionItems()}>
              {(nutritionItem: SearchNutritionItem) =>
                props.children({ clear, nutritionItem })
              }
            </For>
            <For each={recipes()}>
              {(recipe: SearchRecipe) => props.children({ clear, recipe })}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  );
};

export default SearchItemsForm;
