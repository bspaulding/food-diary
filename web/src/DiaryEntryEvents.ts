import { createSignal } from "solid-js";

const [diaryEntriesVersion, setDiaryEntriesVersion] = createSignal(0);

export { diaryEntriesVersion };

export function notifyDiaryEntryCreated(): void {
  setDiaryEntriesVersion((v) => v + 1);
}
