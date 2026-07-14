import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import type { NutritionItemAttrs } from "./Api";
import { lookupNutritionWithLLM } from "./Api";

type Props = {
  isOpen: boolean;
  accessToken: string;
  onClose: () => void;
  onImport: (nutritionData: Partial<NutritionItemAttrs>) => void;
};

const LLMLookupModal: Component<Props> = (props: Props) => {
  const [query, setQuery] = createSignal("");
  const [isLooking, setIsLooking] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleLookup = async (): Promise<void> => {
    const q = query().trim();
    if (!q) return;
    setIsLooking(true);
    setError(null);
    try {
      const result = await lookupNutritionWithLLM(props.accessToken, q);
      props.onImport(result);
      props.onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setIsLooking(false);
    }
  };

  const handleClose = (): void => {
    setQuery("");
    setError(null);
    props.onClose();
  };

  if (!props.isOpen) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div class="relative w-full h-full flex flex-col bg-black">
        <div class="flex justify-between items-center p-4 bg-slate-800">
          <h2 class="text-white text-lg font-semibold">Look Up Nutrition</h2>
          <button
            class="text-white text-2xl"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <textarea
            class="w-full max-w-lg rounded-md p-3 text-black text-base resize-none"
            rows={4}
            placeholder="e.g. 2 scrambled eggs and whole wheat toast"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            disabled={isLooking()}
          />
          {error() ? <p class="text-red-500 text-center">{error()}</p> : null}
        </div>

        <div class="p-4 bg-slate-800 flex justify-center">
          <button
            class="bg-indigo-600 text-white py-3 px-6 text-lg font-semibold rounded-lg disabled:opacity-50"
            onClick={handleLookup}
            disabled={isLooking() || !query().trim()}
          >
            {isLooking() ? "Looking up..." : "Look Up"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LLMLookupModal;
