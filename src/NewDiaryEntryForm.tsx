import type { Component } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";
import {
  fetchRecentEntries,
  fetchEntriesAroundTime,
  fetchTopLoggedItems,
  createDiaryEntry,
  SearchNutritionItem,
  SearchRecipe,
  CreateDiaryEntryInput,
} from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";
import { useAuth } from "./Auth0";
import SearchItemsForm from "./SearchItemsForm";
import ButtonLink from "./ButtonLink";
import SegmentedControl from "./SegmentedControl";
import SuggestionsList from "./SuggestionsList";
import { subHours, addHours } from "date-fns";

function toTimetz(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const offsetMins = -d.getTimezoneOffset();
  const sign = offsetMins >= 0 ? "+" : "-";
  const oh = String(Math.floor(Math.abs(offsetMins) / 60)).padStart(2, "0");
  const om = String(Math.abs(offsetMins) % 60).padStart(2, "0");
  return `${h}:${m}:00${sign}${oh}:${om}`;
}

type RecipeId = number;
type NutritionItemId = number;
type ItemLink = RecipeId | NutritionItemId;
type NewDiaryEntryInput = {
  servings: number;
  consumed_at: Date;
  item_link: ItemLink;
};

type Props = {
  onSubmit?: (input: NewDiaryEntryInput) => void;
};

interface RecentEntry {
  consumed_at: string;
  nutrition_item?: { id: number; description: string };
  recipe?: { id: number; name: string };
}

interface GetRecentEntriesResponse {
  data: {
    food_diary_diary_entry_recent: RecentEntry[];
  };
}

interface GetEntriesAroundTimeResponse {
  data: {
    food_diary_diary_entry: RecentEntry[];
  };
}

interface GetTopLoggedItemsResponse {
  data: {
    food_diary_diary_entry: RecentEntry[];
  };
}

const NewDiaryEntryForm: Component<Props> = ({ onSubmit }: Props) => {
  const [getRecentItemsQuery] = createAuthorizedResource((token: string) =>
    fetchRecentEntries(token),
  );
  const recentItems = (): RecentEntry[] =>
    (getRecentItemsQuery() as GetRecentEntriesResponse | undefined)?.data
      ?.food_diary_diary_entry_recent ?? [];

  const now: Date = new Date();
  const startTime: string = toTimetz(subHours(now, 1));
  const endTime: string = toTimetz(addHours(now, 1));

  const [getTimeBasedItemsQuery] = createAuthorizedResource((token: string) =>
    fetchEntriesAroundTime(token, startTime, endTime),
  );
  const timeBasedItems = (): RecentEntry[] =>
    (getTimeBasedItemsQuery() as GetEntriesAroundTimeResponse | undefined)?.data
      ?.food_diary_diary_entry ?? [];

  const [getTopLoggedItemsQuery] = createAuthorizedResource((token: string) =>
    fetchTopLoggedItems(token),
  );
  const topLoggedItems = createMemo((): RecentEntry[] => {
    const entries =
      (getTopLoggedItemsQuery() as GetTopLoggedItemsResponse | undefined)?.data
        ?.food_diary_diary_entry ?? [];
    const seen = new Map<string, { count: number; entry: RecentEntry }>();
    for (const entry of entries) {
      const key = entry.nutrition_item
        ? `item_${entry.nutrition_item.id}`
        : entry.recipe
          ? `recipe_${entry.recipe.id}`
          : null;
      if (!key) continue;
      if (!seen.has(key)) {
        seen.set(key, { count: 0, entry });
      }
      seen.get(key)!.count++;
    }
    return Array.from(seen.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ entry }) => entry);
  });

  const hasAnySuggestions = createMemo(
    () =>
      timeBasedItems().length > 0 ||
      recentItems().length > 0 ||
      topLoggedItems().length > 0,
  );

  return (
    <div>
      <div class="flex space-x-4 mb-4">
        <ButtonLink href="/">Back to Diary</ButtonLink>
        <ButtonLink href="/nutrition_item/new">Add Item</ButtonLink>
        <ButtonLink href="/recipe/new">Add Recipe</ButtonLink>
      </div>
      <SegmentedControl segments={["Suggestions", "Search"]}>
        {(segment: string) => (
          <>
            <Show when={segment === "Suggestions"}>
              <div>
                <Show when={timeBasedItems().length > 0}>
                  <h2 class="text-lg font-semibold">
                    Logged at this time of day
                  </h2>
                  <SuggestionsList items={timeBasedItems()} />
                </Show>
                <Show when={recentItems().length > 0}>
                  <h2 class="text-lg font-semibold">Recently logged</h2>
                  <SuggestionsList items={recentItems()} />
                </Show>
                <Show when={topLoggedItems().length > 0}>
                  <h2 class="text-lg font-semibold">Most logged</h2>
                  <SuggestionsList items={topLoggedItems()} />
                </Show>
                <Show when={!hasAnySuggestions()}>
                  <p class="text-slate-400 text-center">
                    No suggestions available
                  </p>
                </Show>
              </div>
            </Show>
            <Show when={segment === "Search"}>
              <SearchItemsForm>
                {({
                  nutritionItem,
                  recipe,
                }: {
                  nutritionItem?: SearchNutritionItem;
                  recipe?: SearchRecipe;
                }) => (
                  <li>
                    <LoggableItem
                      nutritionItem={nutritionItem}
                      recipe={recipe}
                    />
                    <span class="bg-slate-400 text-slate-50 px-2 py-1 rounded text-xs ml-8">
                      {recipe ? "RECIPE" : "ITEM"}
                    </span>
                  </li>
                )}
              </SearchItemsForm>
            </Show>
          </>
        )}
      </SegmentedControl>
    </div>
  );
};

export default NewDiaryEntryForm;

export const LoggableItem: Component<{
  recipe?: SearchRecipe;
  nutritionItem?: SearchNutritionItem;
}> = ({
  recipe,
  nutritionItem,
}: {
  recipe?: SearchRecipe;
  nutritionItem?: SearchNutritionItem;
}) => {
  const [{ accessToken }] = useAuth();
  const [logging, setLogging] = createSignal(false);
  const [servings, setServings] = createSignal(1);
  const [created, setCreated] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  return (
    <div class="ml-7">
      <div class="flex items-center -ml-7">
        <button
          class={`mr-1 text-3xl text-indigo-600 transition-transform ${
            logging() ? "rotate-45" : ""
          }`}
          onClick={(): boolean => setLogging((l: boolean) => !l)}
        >
          ⊕
        </button>
        <p>{nutritionItem?.description || recipe?.name}</p>
      </div>
      <Show when={logging()}>
        <div class="ml-2 flex">
          <input
            type="number"
            inputmode="decimal"
            step="0.1"
            value={servings()}
            onInput={(event: InputEvent & { target: HTMLInputElement }) => {
              const parsed: number = parseFloat(event.target.value);
              if (!isNaN(parsed)) {
                setServings(parsed);
              }
            }}
            style={{
              "min-width": "50px",
              border: "1px solid #3e4a49",
              padding: "8px",
            }}
          />
          <button
            class="ml-2 bg-indigo-600 text-slate-50 py-1 px-3 text-lg rounded-md"
            onClick={async (): Promise<void> => {
              const entry: CreateDiaryEntryInput | null = recipe
                ? {
                    servings: servings(),
                    recipe_id: recipe.id,
                  }
                : nutritionItem
                  ? {
                      servings: servings(),
                      nutrition_item_id: nutritionItem.id,
                    }
                  : null;
              if (!entry) {
                return;
              }
              setSaving(true);
              await createDiaryEntry(accessToken(), entry);
              setSaving(false);
              setCreated(true);
              setTimeout(() => setCreated(false), 1000);
              setLogging(false);
            }}
          >
            Save
          </button>
          <Show when={saving()}>Saving...</Show>
        </div>
      </Show>
      <Show when={created()}>
        <span style={{ color: "green" }}>✔</span>
      </Show>
    </div>
  );
};
