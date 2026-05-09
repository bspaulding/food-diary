import type { Accessor, Component, Setter } from "solid-js";
import { Index, Show, createMemo } from "solid-js";
import type {
  DiaryEntry,
  GetEntriesQueryResponse,
  MacroKey,
  RecipeWithItems,
} from "./Api";
import { fetchEntries, deleteDiaryEntry, fetchWeeklyStats } from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";
import { useAuth } from "./Auth0";
import { parseAndFormatTime, parseAndFormatDay, pluralize } from "./Util";
import DateBadge from "./DateBadge";
import ButtonLink from "./ButtonLink";
import CircleProgress from "./CircleProgress";
import { useNutritionTargets } from "./NutritionTargets";
import {
  parseISO,
  format,
  formatISO,
  startOfDay,
  compareAsc,
  compareDesc,
  subDays,
  subWeeks,
} from "date-fns";
import {
  calculateFourWeeksDays,
  calculateDailyAverage,
} from "./WeeklyStatsCalculations";

function localDay(timestamp: string) {
  return formatISO(startOfDay(parseISO(timestamp)));
}

function compareEntriesByConsumedAt(a: DiaryEntry, b: DiaryEntry) {
  return compareAsc(parseISO(a.consumed_at), parseISO(b.consumed_at));
}

function recipeTotalForKey(
  key: MacroKey,
  recipe: RecipeWithItems | undefined,
): number {
  if (!recipe) return 0;
  return (recipe.recipe_items || []).reduce(
    (acc: number, recipe_item) =>
      acc + recipe_item.servings * recipe_item.nutrition_item[key],
    0,
  );
}

function entryTotalMacro(key: MacroKey, entry: DiaryEntry): number {
  const itemTotal = entry.nutrition_item?.[key] || 0;
  return entry.servings * (itemTotal + recipeTotalForKey(key, entry.recipe));
}

function totalMacro(key: MacroKey, entries: DiaryEntry[]): number {
  return entries.reduce(
    (acc: number, entry: DiaryEntry) => acc + entryTotalMacro(key, entry),
    0,
  );
}

const EntryMacro: Component<{
  value: string;
  unit?: string;
  label: string;
}> = (props: { value: string; unit?: string; label: string }) => (
  <div class="text-center text-xl mt-4">
    <p>
      {props.value}
      {props.unit}
    </p>
    <p class="text-sm uppercase">{props.label}</p>
  </div>
);

const DiaryList: Component = () => {
  const [{ accessToken }] = useAuth();
  const [targets] = useNutritionTargets();
  const [getEntriesQuery, { mutate }] = createAuthorizedResource(
    (token: string) => fetchEntries(token),
  );

  // Fetch weekly stats from the backend
  const now = new Date();
  const todayStart = formatISO(startOfDay(now));
  const sevenDaysAgoStart = formatISO(startOfDay(subDays(now, 7)));
  const fourWeeksAgoStart = formatISO(startOfDay(subWeeks(now, 4)));

  const [weeklyStatsQuery] = createAuthorizedResource((token: string) =>
    fetchWeeklyStats(token, sevenDaysAgoStart, todayStart, fourWeeksAgoStart),
  );

  // Rolling 7-day window for consistent daily average
  const currentWeekDays = 7;
  const fourWeeksDays = calculateFourWeeksDays(now);

  const entries = () => getEntriesQuery()?.data?.food_diary_diary_entry || [];
  const entriesByDay = (): [string, DiaryEntry[]][] => {
    const grouped = entries().reduce(
      (acc: Record<string, DiaryEntry[]>, entry: DiaryEntry) => ({
        ...acc,
        [localDay(entry.consumed_at)]: [
          ...(acc[localDay(entry.consumed_at)] || []),
          entry,
        ],
      }),
      {},
    );
    return (Object.entries(grouped) as [string, DiaryEntry[]][]).sort(
      function (a, b) {
        return compareDesc(parseISO(a[0]), parseISO(b[0]));
      },
    );
  };

  return (
    <>
      <div class="flex space-x-4 mb-4">
        <ButtonLink href="/diary_entry/new">Add New Entry</ButtonLink>
        <ButtonLink href="/nutrition_item/new">Add Item</ButtonLink>
        <ButtonLink href="/recipe/new">Add Recipe</ButtonLink>
      </div>
      <Show when={weeklyStatsQuery()?.data}>
        <div class="flex justify-around mb-6 border-t border-b border-slate-200 py-2">
          <EntryMacro
            value={String(
              calculateDailyAverage(
                weeklyStatsQuery()?.data?.current_week?.aggregate?.sum
                  ?.calories || 0,
                currentWeekDays,
              ),
            )}
            unit=" kcal/day"
            label="Last 7 Days"
          />
          <EntryMacro
            value={String(
              calculateDailyAverage(
                weeklyStatsQuery()?.data?.past_four_weeks?.aggregate?.sum
                  ?.calories || 0,
                fourWeeksDays,
              ),
            )}
            unit=" kcal/day"
            label="4 Week Avg"
          />
          <div class="text-center mb-4">
            <a
              href="/trends"
              class="text-indigo-600 hover:text-indigo-800 underline"
            >
              View Trends
            </a>
          </div>
        </div>
      </Show>
      <ul class="mt-4">
        <Show when={entries().length === 0}>
          <p class="text-slate-400 text-center">No entries, yet...</p>
        </Show>
        <Index each={entriesByDay()}>
          {(dayEntries: () => [string, DiaryEntry[]], i: number) => {
            const dateStr = createMemo(() => dayEntries()[0]);
            const entries = createMemo(() => dayEntries()[1]);
            return (
              <li class="grid grid-cols-8 -ml-4 mb-6">
                <div class="col-span-2">
                  <DateBadge
                    class="col-span-1 mb-2"
                    date={parseISO(dateStr())}
                  />
                  <CircleProgress
                    value={Math.ceil(
                      entries().reduce(
                        (acc: number, entry: DiaryEntry) =>
                          acc + entry.calories,
                        0,
                      ),
                    )}
                    target={targets().calories}
                    max={targets().calories_max}
                    label="KCAL"
                  />
                  <CircleProgress
                    value={totalMacro("protein_grams", entries())}
                    target={targets().protein_grams}
                    label="Protein"
                    unit="g"
                  />
                  <CircleProgress
                    value={totalMacro("dietary_fiber_grams", entries())}
                    target={targets().dietary_fiber_grams}
                    label="Fiber"
                    unit="g"
                  />
                  <CircleProgress
                    value={totalMacro("added_sugars_grams", entries())}
                    target={targets().added_sugars_grams}
                    label="Added Sugar"
                    unit="g"
                    isLimit={true}
                  />
                </div>
                <ul class="col-span-6 mb-6">
                  <Index
                    each={entries().slice().sort(compareEntriesByConsumedAt)}
                  >
                    {(entry: () => DiaryEntry, i: number) => (
                      <li class="mb-4">
                        <p class="font-semibold">
                          {entry().calories} kcal,{" "}
                          {entryTotalMacro("protein_grams", entry())}g protein,{" "}
                          {entryTotalMacro("dietary_fiber_grams", entry())}g
                          fiber
                        </p>
                        <p>
                          <a
                            href={
                              entry().recipe?.id
                                ? `/recipe/${entry().recipe?.id}`
                                : `/nutrition_item/${
                                    entry().nutrition_item?.id
                                  }`
                            }
                          >
                            {entry().nutrition_item?.description ||
                              entry().recipe?.name}
                          </a>
                        </p>
                        <p class="flex justify-between text-sm">
                          {pluralize(entry().servings, "serving", "servings")}{" "}
                          at {parseAndFormatTime(entry().consumed_at)}
                          <span>
                            <a href={`/diary_entry/${entry().id}/edit`}>Edit</a>
                            <button
                              class="ml-2"
                              onClick={() => {
                                const entries = getEntriesQuery();
                                if (entries) {
                                  deleteEntry(
                                    accessToken,
                                    entry(),
                                    entries as GetEntriesQueryResponse,
                                    mutate,
                                  );
                                }
                              }}
                            >
                              Delete
                            </button>
                          </span>
                        </p>
                        <Show when={entry().recipe?.id}>
                          <p>
                            <span class="bg-slate-400 text-slate-50 px-2 py-1 rounded text-xs">
                              RECIPE
                            </span>
                          </p>
                        </Show>
                      </li>
                    )}
                  </Index>
                </ul>
              </li>
            );
          }}
        </Index>
      </ul>
    </>
  );
};

export default DiaryList;

function removeEntry(
  entry: DiaryEntry,
  entriesQuery: GetEntriesQueryResponse,
  mutate: Setter<GetEntriesQueryResponse | undefined>,
) {
  mutate({
    ...entriesQuery,
    data: {
      ...entriesQuery.data,
      food_diary_diary_entry: (
        entriesQuery?.data?.food_diary_diary_entry || []
      ).filter((e) => e.id !== entry.id),
    },
  });
}
async function deleteEntry(
  accessToken: Accessor<string>,
  entry: DiaryEntry,
  entriesQuery: GetEntriesQueryResponse,
  mutate: Setter<GetEntriesQueryResponse | undefined>,
) {
  try {
    removeEntry(entry, entriesQuery, mutate);
    const response: { data: unknown } = await deleteDiaryEntry(
      accessToken(),
      entry.id,
    );
    if (!response.data) {
      mutate(entriesQuery);
    }
  } catch (e: unknown) {
    console.error("Failed to delete entry: ", e);
  }
}
