import type { Component, ParentProps } from "solid-js";
import { createContext, useContext, createSignal } from "solid-js";

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

function loadTargets(): NutritionTargets {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_TARGETS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_TARGETS };
}

type NutritionTargetsContextValue = [
  () => NutritionTargets,
  (updates: Partial<NutritionTargets>) => void,
];

const NutritionTargetsContext = createContext<NutritionTargetsContextValue>([
  () => DEFAULT_TARGETS,
  () => {},
]);

export const NutritionTargetsProvider: Component<ParentProps> = (props) => {
  const [targets, setTargets] = createSignal<NutritionTargets>(loadTargets());

  const updateTargets = (updates: Partial<NutritionTargets>) => {
    const next = { ...targets(), ...updates };
    setTargets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <NutritionTargetsContext.Provider value={[targets, updateTargets]}>
      {props.children}
    </NutritionTargetsContext.Provider>
  );
};

export const useNutritionTargets = () => useContext(NutritionTargetsContext);
