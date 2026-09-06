import type { Component, JSX } from "solid-js";
import { createSignal, Show, For } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import {
  searchItemsAndRecipes,
  searchItemsOnly,
  SearchNutritionItem,
  SearchRecipe,
  SearchResultRow,
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
  const isItemsOnly = (): boolean =>
    props.queryType === ItemsQueryType.ItemsOnly;
  const itemsOnly = (): SearchNutritionItem[] =>
    getItemsQuery()?.data?.food_diary_search_nutrition_items || [];
  const results = (): SearchResultRow[] =>
    getItemsQuery()?.data?.food_diary_search_all || [];
  const resultCount = (): number =>
    isItemsOnly() ? itemsOnly().length : results().length;
  const clear = (): string => setSearch("");

  return (
    <section class="flex flex-col mt-5">
      <div class="relative">
        <input
          class="border rounded px-2 pr-8 text-lg w-full"
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
        <Show when={search().length}>
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xl leading-none"
            onClick={clear}
            aria-label="Clear search"
          >
            ✕
          </button>
        </Show>
      </div>
      <div class="px-1">
        <Show when={!search().length}>
          <p class="text-center mt-4 text-slate-400">
            Search for an item or recipe you've previously added.
          </p>
        </Show>
        <Show when={search().length}>
          <p class="text-center mt-4 text-slate-400">
            <Show when={getItemsQuery.loading}>Searching...</Show>
            <Show when={!getItemsQuery.loading}>{resultCount()} items</Show>
          </p>
          <ul>
            <Show when={isItemsOnly()}>
              <For each={itemsOnly()}>
                {(nutritionItem: SearchNutritionItem) =>
                  props.children({ clear, nutritionItem })
                }
              </For>
            </Show>
            <Show when={!isItemsOnly()}>
              <For each={results()}>
                {(result: SearchResultRow) =>
                  result.recipe
                    ? props.children({ clear, recipe: result.recipe })
                    : props.children({
                        clear,
                        nutritionItem: result.nutrition_item ?? undefined,
                      })
                }
              </For>
            </Show>
          </ul>
        </Show>
      </div>
    </section>
  );
};

export default SearchItemsForm;
