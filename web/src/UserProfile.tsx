import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import { useAuth } from "./Auth0";
import { useNutritionTargets } from "./NutritionTargets";

type Auth0User = {
  picture?: string;
  nickname?: string;
  name?: string;
  email?: string;
};

const UserProfile: Component = () => {
  const [{ user, auth0 }] = useAuth();
  const userObj = (): Auth0User => (user() ?? {}) as Auth0User;

  const [targets, updateTargets] = useNutritionTargets();
  const [saved, setSaved] = createSignal(false);

  let caloriesRef!: HTMLInputElement;
  let caloriesMaxRef!: HTMLInputElement;
  let proteinRef!: HTMLInputElement;
  let fiberRef!: HTMLInputElement;
  let sugarRef!: HTMLInputElement;

  const handleSaveTargets = (e: Event) => {
    e.preventDefault();
    updateTargets({
      calories: Number(caloriesRef.value),
      calories_max: Number(caloriesMaxRef.value),
      protein_grams: Number(proteinRef.value),
      dietary_fiber_grams: Number(fiberRef.value),
      added_sugars_grams: Number(sugarRef.value),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div class="flex flex-col items-center">
      <img
        src={userObj()?.picture}
        class="border border-slate-800 rounded-full mb-4 max-w-xs"
      />
      <p class="font-semibold text-lg">
        {userObj()?.nickname || userObj()?.name}
      </p>
      <p class="text-lg">{userObj()?.email}</p>

      <div class="mt-6 w-full max-w-sm">
        <h2 class="font-semibold text-lg mb-3">Daily Targets</h2>
        <form onSubmit={handleSaveTargets} class="flex flex-col gap-3">
          <label class="flex justify-between items-center">
            <span>Calorie min (kcal)</span>
            <input
              ref={caloriesRef}
              type="number"
              min="0"
              value={targets().calories}
              class="w-24 border border-slate-300 rounded px-2 py-1 text-right"
            />
          </label>
          <label class="flex justify-between items-center">
            <span>Calorie max (kcal)</span>
            <input
              ref={caloriesMaxRef}
              type="number"
              min="0"
              value={targets().calories_max}
              class="w-24 border border-slate-300 rounded px-2 py-1 text-right"
            />
          </label>
          <label class="flex justify-between items-center">
            <span>Protein (g)</span>
            <input
              ref={proteinRef}
              type="number"
              min="0"
              value={targets().protein_grams}
              class="w-24 border border-slate-300 rounded px-2 py-1 text-right"
            />
          </label>
          <label class="flex justify-between items-center">
            <span>Dietary Fiber (g)</span>
            <input
              ref={fiberRef}
              type="number"
              min="0"
              value={targets().dietary_fiber_grams}
              class="w-24 border border-slate-300 rounded px-2 py-1 text-right"
            />
          </label>
          <label class="flex justify-between items-center">
            <span>Added Sugar (g)</span>
            <input
              ref={sugarRef}
              type="number"
              min="0"
              value={targets().added_sugars_grams}
              class="w-24 border border-slate-300 rounded px-2 py-1 text-right"
            />
          </label>
          <button
            type="submit"
            class="mt-2 bg-indigo-600 text-white rounded px-4 py-2 hover:bg-indigo-700"
          >
            {saved() ? "Saved!" : "Save Targets"}
          </button>
        </form>
      </div>

      <div class="mt-6 flex flex-col gap-2 w-full max-w-sm">
        <a href="/diary_entry/import">Import Entries</a>
        <a href="/diary_entry/export">Export Entries</a>
      </div>

      <button
        class="text-red-600 mt-4"
        onClick={(): void => {
          auth0()?.logout({
            returnTo: `${window.location.protocol}//${window.location.host}/auth/logout`,
          });
        }}
      >
        Logout
      </button>
    </div>
  );
};

export default UserProfile;
