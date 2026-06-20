import type { Component, ParentProps } from "solid-js";
import { createContext, useContext, createSignal } from "solid-js";
import {
  fetchNutritionTargets,
  setNutritionTargets as apiSetNutritionTargets,
} from "./Api";

export type NutritionTargets = {
  calories: number;
  calories_max: number;
  protein_grams: number;
  dietary_fiber_grams: number;
  added_sugars_grams: number;
};

export const DEFAULT_TARGETS: NutritionTargets = {
  calories: 2000,
  calories_max: 2400,
  protein_grams: 130,
  dietary_fiber_grams: 25,
  added_sugars_grams: 25,
};

const STORAGE_KEY = "nutrition_targets";

function readStoredTargets(): NutritionTargets | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_TARGETS, ...JSON.parse(stored) };
  } catch {}
  return null;
}

type NutritionTargetsContextValue = [
  () => NutritionTargets,
  (updates: Partial<NutritionTargets>, accessToken: string) => Promise<void>,
  (accessToken: string) => Promise<void>,
];

const NutritionTargetsContext = createContext<NutritionTargetsContextValue>([
  () => DEFAULT_TARGETS,
  async () => {},
  async () => {},
]);

export const NutritionTargetsProvider: Component<ParentProps> = (props) => {
  const [targets, setTargets] = createSignal<NutritionTargets>(
    readStoredTargets() ?? { ...DEFAULT_TARGETS },
  );

  const updateTargets = async (
    updates: Partial<NutritionTargets>,
    accessToken: string,
  ) => {
    const next = { ...targets(), ...updates };
    await apiSetNutritionTargets(accessToken, next);
    setTargets(next);
  };

  // On launch: the server is the source of truth. If the server has no row
  // yet but the browser has pre-migration localStorage targets, push those
  // to the server once and stop relying on localStorage from then on.
  const syncFromBackend = async (accessToken: string) => {
    const response = await fetchNutritionTargets(accessToken);
    const [backendTargets] = response.data?.food_diary_nutrition_target ?? [];
    if (backendTargets) {
      setTargets(backendTargets);
      return;
    }

    const stored = readStoredTargets();
    if (stored) {
      await apiSetNutritionTargets(accessToken, stored);
      setTargets(stored);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <NutritionTargetsContext.Provider
      value={[targets, updateTargets, syncFromBackend]}
    >
      {props.children}
    </NutritionTargetsContext.Provider>
  );
};

export const useNutritionTargets = () => useContext(NutritionTargetsContext);
