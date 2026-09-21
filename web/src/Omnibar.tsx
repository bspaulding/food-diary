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
import { LoggableItem } from "./NewDiaryEntryForm";

const RESULT_LIMIT = 3;

// The panel opens on click/focus, not just once a query exists, so the
// dropdown must be able to render with an empty query (no results, no
// fallback yet) -- that's the "isOpen" gate below.
const Omnibar: Component = () => {
  const [search, setSearch] = createSignal("");
  const [isOpen, setIsOpen] = createSignal(false);
  const navigate = useNavigate();
  let containerRef: HTMLDivElement | undefined;

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

  const clear = (): void => {
    setSearch("");
  };

  // Logging a result inline (typing a servings amount, clicking Save) moves
  // focus around inside the panel -- only close once focus actually leaves
  // the omnibar entirely, not just the search input itself.
  const handleFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (!containerRef || !next || !containerRef.contains(next)) {
      setIsOpen(false);
    }
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
      <div
        ref={containerRef}
        class="relative max-w-xl mx-auto pointer-events-auto"
        onFocusOut={handleFocusOut}
      >
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
                      onClick={addAsItem}
                    >
                      ⊕ Add &quot;{trimmedSearch()}&quot; as new item
                    </button>
                    <button
                      type="button"
                      class="text-left px-2 py-2 rounded hover:bg-slate-100"
                      onClick={addAsRecipe}
                    >
                      ⊕ Add &quot;{trimmedSearch()}&quot; as new recipe
                    </button>
                  </div>
                }
              >
                <ul class="p-2">
                  <For each={results()}>
                    {(row: SearchResultRow) => (
                      <li>
                        <LoggableItem
                          nutritionItem={row.nutrition_item ?? undefined}
                          recipe={row.recipe ?? undefined}
                        />
                        <span class="bg-slate-400 text-slate-50 px-2 py-1 rounded text-xs ml-8">
                          {row.recipe ? "RECIPE" : "ITEM"}
                        </span>
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
