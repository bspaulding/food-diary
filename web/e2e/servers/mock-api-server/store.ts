/**
 * In-memory model of exactly the entities web/src/Api.ts touches. Field
 * names are snake_case throughout, matching the wire format Api.ts already
 * sends/expects -- no ORM, no schema, just plain records plus the handful
 * of derived-value formulas confirmed against the real Postgres functions
 * in graphql-engine/migrations (recipe_calories, diary_entry_calories,
 * recipe_protein, recipe_added_sugar, diary_entry_protein,
 * diary_entry_added_sugar, top_entries_around_hour).
 */

export type NutritionItemAttrsRecord = {
  description: string;
  calories: number;
  total_fat_grams: number;
  saturated_fat_grams: number;
  trans_fat_grams: number;
  polyunsaturated_fat_grams: number;
  monounsaturated_fat_grams: number;
  cholesterol_milligrams: number;
  sodium_milligrams: number;
  total_carbohydrate_grams: number;
  dietary_fiber_grams: number;
  total_sugars_grams: number;
  added_sugars_grams: number;
  protein_grams: number;
};

export type NutritionItemRecord = NutritionItemAttrsRecord & { id: number };

export type RecipeItemRecord = { nutrition_item_id: number; servings: number };

export type RecipeRecord = {
  id: number;
  name: string;
  total_servings: number;
  recipe_items: RecipeItemRecord[];
};

export type DiaryEntryRecord = {
  id: number;
  consumed_at: string; // ISO 8601
  servings: number;
  nutrition_item_id: number | null;
  recipe_id: number | null;
};

export type NutritionTargetRecord = {
  user_id: string;
  calories: number;
  calories_max: number;
  protein_grams: number;
  dietary_fiber_grams: number;
  added_sugars_grams: number;
};

export type ExpandedRecipeItem = {
  servings: number;
  nutrition_item: NutritionItemRecord;
};

export type ExpandedRecipe = {
  id: number;
  name: string;
  calories: number;
  total_servings: number;
  recipe_items: ExpandedRecipeItem[];
};

export type ExpandedDiaryEntry = {
  id: number;
  consumed_at: string;
  servings: number;
  calories: number;
  nutrition_item: NutritionItemRecord | null;
  recipe: ExpandedRecipe | null;
};

export class MockApiStore {
  private nutritionItems = new Map<number, NutritionItemRecord>();
  private recipes = new Map<number, RecipeRecord>();
  private diaryEntries = new Map<number, DiaryEntryRecord>();
  private nutritionTarget: NutritionTargetRecord | null = null;
  private nextNutritionItemId = 1;
  private nextRecipeId = 1;
  private nextDiaryEntryId = 1;
  private clockOverrideMs: number | null = null;
  private armedErrorStatus: number | null = null;
  private armedErrorRemaining = 0;

  reset(): void {
    this.nutritionItems.clear();
    this.recipes.clear();
    this.diaryEntries.clear();
    this.nutritionTarget = null;
    this.nextNutritionItemId = 1;
    this.nextRecipeId = 1;
    this.nextDiaryEntryId = 1;
    this.clockOverrideMs = null;
    this.armedErrorStatus = null;
    this.armedErrorRemaining = 0;
  }

  // --- forced-error injection (for the 401/session-expiry test path) -----

  /** Arms the next `times` authenticated requests (any endpoint) to fail with `status`. */
  armError(status: number, times: number): void {
    this.armedErrorStatus = status;
    this.armedErrorRemaining = times;
  }

  /** Consumes one armed failure, if any are pending, returning its status. */
  consumeArmedError(): number | null {
    if (this.armedErrorRemaining <= 0) return null;
    this.armedErrorRemaining -= 1;
    const status = this.armedErrorStatus;
    if (this.armedErrorRemaining <= 0) this.armedErrorStatus = null;
    return status;
  }

  // --- clock -----------------------------------------------------------

  /** Freezes "now" for deterministic day-grouping/weekly-stats assertions. */
  setClock(iso: string): void {
    this.clockOverrideMs = new Date(iso).getTime();
  }

  now(): Date {
    return new Date(this.clockOverrideMs ?? Date.now());
  }

  // --- nutrition items ---------------------------------------------------

  createNutritionItem(attrs: NutritionItemAttrsRecord): NutritionItemRecord {
    const record: NutritionItemRecord = {
      id: this.nextNutritionItemId++,
      ...attrs,
    };
    this.nutritionItems.set(record.id, record);
    return record;
  }

  updateNutritionItem(
    id: number,
    attrs: Partial<NutritionItemAttrsRecord>,
  ): NutritionItemRecord | null {
    const existing = this.nutritionItems.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...attrs, id };
    this.nutritionItems.set(id, updated);
    return updated;
  }

  getNutritionItem(id: number): NutritionItemRecord | null {
    return this.nutritionItems.get(id) ?? null;
  }

  searchNutritionItems(search: string): NutritionItemRecord[] {
    const needle = search.toLowerCase();
    return [...this.nutritionItems.values()].filter((item) =>
      item.description.toLowerCase().includes(needle),
    );
  }

  // --- recipes -----------------------------------------------------------

  createRecipe(
    name: string,
    totalServings: number,
    items: RecipeItemRecord[],
  ): RecipeRecord {
    const record: RecipeRecord = {
      id: this.nextRecipeId++,
      name,
      total_servings: totalServings,
      recipe_items: items,
    };
    this.recipes.set(record.id, record);
    return record;
  }

  updateRecipe(
    id: number,
    attrs: { name?: string; total_servings?: number },
    items: RecipeItemRecord[],
  ): RecipeRecord | null {
    const existing = this.recipes.get(id);
    if (!existing) return null;
    const updated: RecipeRecord = {
      ...existing,
      ...attrs,
      recipe_items: items,
    };
    this.recipes.set(id, updated);
    return updated;
  }

  getRecipe(id: number): RecipeRecord | null {
    return this.recipes.get(id) ?? null;
  }

  searchRecipes(search: string): RecipeRecord[] {
    const needle = search.toLowerCase();
    return [...this.recipes.values()].filter((recipe) =>
      recipe.name.toLowerCase().includes(needle),
    );
  }

  /** Per-serving calories for a recipe: sum(item.servings * item.calories) / recipe.total_servings. */
  recipeCaloriesPerServing(recipe: RecipeRecord): number {
    return this.recipeMacroPerServing(recipe, "calories");
  }

  private recipeMacroPerServing(
    recipe: RecipeRecord,
    key: "calories" | "protein_grams" | "added_sugars_grams",
  ): number {
    if (recipe.total_servings === 0) return 0;
    const total = recipe.recipe_items.reduce((sum, item) => {
      const nutritionItem = this.nutritionItems.get(item.nutrition_item_id);
      return sum + item.servings * (nutritionItem?.[key] ?? 0);
    }, 0);
    return total / recipe.total_servings;
  }

  // --- diary entries -------------------------------------------------------

  createDiaryEntry(input: {
    servings: number;
    nutrition_item_id?: number;
    recipe_id?: number;
    consumed_at?: string;
  }): DiaryEntryRecord {
    const record: DiaryEntryRecord = {
      id: this.nextDiaryEntryId++,
      consumed_at: input.consumed_at ?? this.now().toISOString(),
      servings: input.servings,
      nutrition_item_id: input.nutrition_item_id ?? null,
      recipe_id: input.recipe_id ?? null,
    };
    this.diaryEntries.set(record.id, record);
    return record;
  }

  updateDiaryEntry(
    id: number,
    attrs: { servings?: number; consumed_at?: string },
  ): DiaryEntryRecord | null {
    const existing = this.diaryEntries.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...attrs, id };
    this.diaryEntries.set(id, updated);
    return updated;
  }

  deleteDiaryEntry(id: number): DiaryEntryRecord | null {
    const existing = this.diaryEntries.get(id);
    if (!existing) return null;
    this.diaryEntries.delete(id);
    return existing;
  }

  getDiaryEntry(id: number): DiaryEntryRecord | null {
    return this.diaryEntries.get(id) ?? null;
  }

  listDiaryEntries(range?: {
    gte?: string;
    lt?: string;
    lte?: string;
  }): DiaryEntryRecord[] {
    let entries = [...this.diaryEntries.values()];
    if (range?.gte) {
      const gte = new Date(range.gte).getTime();
      entries = entries.filter((e) => new Date(e.consumed_at).getTime() >= gte);
    }
    if (range?.lt) {
      const lt = new Date(range.lt).getTime();
      entries = entries.filter((e) => new Date(e.consumed_at).getTime() < lt);
    }
    if (range?.lte) {
      const lte = new Date(range.lte).getTime();
      entries = entries.filter((e) => new Date(e.consumed_at).getTime() <= lte);
    }
    return entries;
  }

  /** calories = servings * (recipe ? recipeCaloriesPerServing(recipe) : item.calories). */
  diaryEntryCalories(entry: DiaryEntryRecord): number {
    return this.diaryEntryMacro(entry, "calories");
  }

  diaryEntryProtein(entry: DiaryEntryRecord): number {
    return this.diaryEntryMacro(entry, "protein_grams");
  }

  diaryEntryAddedSugar(entry: DiaryEntryRecord): number {
    return this.diaryEntryMacro(entry, "added_sugars_grams");
  }

  private diaryEntryMacro(
    entry: DiaryEntryRecord,
    key: "calories" | "protein_grams" | "added_sugars_grams",
  ): number {
    if (entry.recipe_id !== null) {
      const recipe = this.recipes.get(entry.recipe_id);
      if (!recipe) return 0;
      return entry.servings * this.recipeMacroPerServing(recipe, key);
    }
    if (entry.nutrition_item_id !== null) {
      const item = this.nutritionItems.get(entry.nutrition_item_id);
      return entry.servings * (item?.[key] ?? 0);
    }
    return 0;
  }

  expandDiaryEntry(entry: DiaryEntryRecord): ExpandedDiaryEntry {
    return {
      id: entry.id,
      consumed_at: entry.consumed_at,
      servings: entry.servings,
      calories: this.diaryEntryCalories(entry),
      nutrition_item:
        entry.nutrition_item_id !== null
          ? (this.nutritionItems.get(entry.nutrition_item_id) ?? null)
          : null,
      recipe:
        entry.recipe_id !== null ? this.expandRecipe(entry.recipe_id) : null,
    };
  }

  expandRecipe(id: number): ExpandedRecipe | null {
    const recipe = this.recipes.get(id);
    if (!recipe) return null;
    return {
      id: recipe.id,
      name: recipe.name,
      calories: this.recipeCaloriesPerServing(recipe),
      total_servings: recipe.total_servings,
      recipe_items: recipe.recipe_items
        .map((item) => {
          const nutritionItem = this.nutritionItems.get(item.nutrition_item_id);
          return nutritionItem
            ? { servings: item.servings, nutrition_item: nutritionItem }
            : null;
        })
        .filter((item): item is ExpandedRecipeItem => item !== null),
    };
  }

  // --- nutrition targets ---------------------------------------------------

  getNutritionTarget(): NutritionTargetRecord | null {
    return this.nutritionTarget;
  }

  setNutritionTarget(
    userId: string,
    attrs: Omit<NutritionTargetRecord, "user_id">,
  ): NutritionTargetRecord {
    this.nutritionTarget = { user_id: userId, ...attrs };
    return this.nutritionTarget;
  }

  // --- debug/test-control ---------------------------------------------------

  dump(): {
    nutritionItems: NutritionItemRecord[];
    recipes: RecipeRecord[];
    diaryEntries: DiaryEntryRecord[];
    nutritionTarget: NutritionTargetRecord | null;
    now: string;
  } {
    return {
      nutritionItems: [...this.nutritionItems.values()],
      recipes: [...this.recipes.values()],
      diaryEntries: [...this.diaryEntries.values()],
      nutritionTarget: this.nutritionTarget,
      now: this.now().toISOString(),
    };
  }
}
