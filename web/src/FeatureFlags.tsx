import type { Component, ParentProps } from "solid-js";
import { createContext, useContext, createSignal } from "solid-js";

const OMNIBAR_STORAGE_KEY = "feature_omnibar_search";

function readStoredFlag(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === "true";
  } catch {
    return defaultValue;
  }
}

type OmnibarFeatureFlagContextValue = [
  () => boolean,
  (enabled: boolean) => void,
];

const OmnibarFeatureFlagContext = createContext<OmnibarFeatureFlagContextValue>(
  [() => true, () => {}],
);

export const OmnibarFeatureFlagProvider: Component<ParentProps> = (props) => {
  const [enabled, setEnabledSignal] = createSignal(
    readStoredFlag(OMNIBAR_STORAGE_KEY, true),
  );

  const setEnabled = (value: boolean): void => {
    try {
      localStorage.setItem(OMNIBAR_STORAGE_KEY, String(value));
    } catch {}
    setEnabledSignal(value);
  };

  return (
    <OmnibarFeatureFlagContext.Provider value={[enabled, setEnabled]}>
      {props.children}
    </OmnibarFeatureFlagContext.Provider>
  );
};

export const useOmnibarFeatureFlag = () =>
  useContext(OmnibarFeatureFlagContext);
