import type { Component } from "solid-js";
import { createSignal, Show, For } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { useNavigate } from "@solidjs/router";
import {
  searchItemsAndRecipes,
  SearchItemsAndRecipesQueryResponse,
  SearchResultRow,
} from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";

const RESULT_LIMIT = 3;

// The panel opens on click/focus, not just once a query exists, so the
// dropdown must be able to render with an empty query (no results, no
// fallback yet) -- that's the "isOpen" gate below.
const Omnibar: Component = () => {
  const [search, setSearch] = createSignal("");
  const [isOpen, setIsOpen] = createSignal(false);
  const navigate = useNavigate();

  const [getResults] = createAuthorizedResource(
    search,
    (
      token: string,
      searchValue: string,
    ): Promise<SearchItemsAndRecipesQueryResponse> =>
      searchItemsAndRecipes(token, searchValue),
  );

  const results = (): SearchResultRow[] =>
    (getResults()?.data?.food_diary_search_all ?? []).slice(0, RESULT_LIMIT);

  const trimmedSearch = (): string => search().trim();
  const showPanel = (): boolean => isOpen() && trimmedSearch().length > 0;
  const hasResults = (): boolean => results().length > 0;

  const clear = (): void => setSearch("");

  // A mousedown on a panel button fires before the input's blur, so
  // preventing its default keeps focus on the input (instead of closing the
  // panel) long enough for the subsequent click to be handled.
  const keepFocus = (event: MouseEvent): void => event.preventDefault();

  const goToResult = (row: SearchResultRow): void => {
    if (row.recipe) {
      navigate(`/recipe/${row.recipe.id}`);
    } else if (row.nutrition_item) {
      navigate(`/nutrition_item/${row.nutrition_item.id}`);
    }
    clear();
    setIsOpen(false);
  };

  const addAsItem = (): void => {
    navigate(
      `/nutrition_item/new?description=${encodeURIComponent(trimmedSearch())}`,
    );
    clear();
    setIsOpen(false);
  };

  const addAsRecipe = (): void => {
    navigate(`/recipe/new?name=${encodeURIComponent(trimmedSearch())}`);
    clear();
    setIsOpen(false);
  };

  return (
    <div class="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none">
      <div class="relative max-w-xl mx-auto pointer-events-auto">
        <Show when={showPanel()}>
          <div class="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden max-h-80 overflow-y-auto">
            <Show when={getResults.loading}>
              <p class="text-center text-slate-400 py-3">Searching...</p>
            </Show>
            <Show when={!getResults.loading}>
              <Show
                when={hasResults()}
                fallback={
                  <div class="flex flex-col p-2 gap-1">
                    <p class="text-sm text-slate-400 px-2 pt-1">
                      No results for &quot;{trimmedSearch()}&quot;
                    </p>
                    <button
                      type="button"
                      class="text-left px-2 py-2 rounded hover:bg-slate-100"
                      onMouseDown={keepFocus}
                      onClick={addAsItem}
                    >
                      ⊕ Add &quot;{trimmedSearch()}&quot; as new item
                    </button>
                    <button
                      type="button"
                      class="text-left px-2 py-2 rounded hover:bg-slate-100"
                      onMouseDown={keepFocus}
                      onClick={addAsRecipe}
                    >
                      ⊕ Add &quot;{trimmedSearch()}&quot; as new recipe
                    </button>
                  </div>
                }
              >
                <ul>
                  <For each={results()}>
                    {(row: SearchResultRow) => (
                      <li>
                        <button
                          type="button"
                          class="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center justify-between"
                          onMouseDown={keepFocus}
                          onClick={() => goToResult(row)}
                        >
                          <span>
                            {row.recipe
                              ? row.recipe.name
                              : row.nutrition_item?.description}
                          </span>
                          <span class="text-xs text-slate-400 ml-2">
                            {row.recipe ? "Recipe" : "Item"}
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </div>
        </Show>
        <div class="relative">
          <input
            class="w-full border border-slate-300 rounded-full px-4 py-3 shadow-lg bg-white text-lg"
            type="search"
            placeholder="Search items and recipes..."
            aria-label="Search items and recipes"
            name="omnibar-search"
            value={search()}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onInput={debounce((event: InputEvent): void => {
              const target = event.target;
              if (target instanceof HTMLInputElement) {
                setSearch(target.value);
              }
            }, 300)}
          />
          <Show when={search().length}>
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl leading-none"
              onMouseDown={keepFocus}
              onClick={clear}
              aria-label="Clear search"
            >
              ✕
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Omnibar;
