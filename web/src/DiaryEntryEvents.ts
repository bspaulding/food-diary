import { createSignal } from "solid-js";

// A module-level counter that bumps whenever a diary entry is created
// somewhere outside the diary list itself (e.g. the Omnibar, which stays
// mounted across route changes and so can't rely on DiaryList remounting
// to pick up new entries). DiaryList watches this to know when to refetch.
const [diaryEntriesVersion, setDiaryEntriesVersion] = createSignal(0);

export { diaryEntriesVersion };

export function notifyDiaryEntryCreated(): void {
  setDiaryEntriesVersion((v) => v + 1);
}
