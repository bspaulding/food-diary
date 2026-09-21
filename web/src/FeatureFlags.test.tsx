import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";
import {
  OmnibarFeatureFlagProvider,
  useOmnibarFeatureFlag,
} from "./FeatureFlags";

const STORAGE_KEY = "feature_omnibar_search";

type ContextValue = ReturnType<typeof useOmnibarFeatureFlag>;

function renderProvider(): ContextValue {
  let captured!: ContextValue;
  function Consumer() {
    captured = useOmnibarFeatureFlag();
    return null;
  }
  render(() => (
    <OmnibarFeatureFlagProvider>
      <Consumer />
    </OmnibarFeatureFlagProvider>
  ));
  return captured;
}

describe("FeatureFlags", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled when localStorage is empty", () => {
    const [enabled] = renderProvider();
    expect(enabled()).toBe(true);
  });

  it("reads a previously stored disabled value", () => {
    localStorage.setItem(STORAGE_KEY, "false");
    const [enabled] = renderProvider();
    expect(enabled()).toBe(false);
  });

  it("reads a previously stored enabled value", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const [enabled] = renderProvider();
    expect(enabled()).toBe(true);
  });

  it("persists updates to localStorage and updates the signal", () => {
    const [enabled, setEnabled] = renderProvider();
    expect(enabled()).toBe(true);

    setEnabled(false);

    expect(enabled()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("falls back to the default (enabled) outside a provider", () => {
    function Consumer() {
      const [enabled] = useOmnibarFeatureFlag();
      expect(enabled()).toBe(true);
      return null;
    }
    render(() => <Consumer />);
  });
});
