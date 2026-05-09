import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import { useAuth } from "./Auth0";
import { fetchExportEntries } from "./Api";
import { entriesToCsv, EntryRecord } from "./CSVExport";
import ButtonLink from "./ButtonLink";

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultExportStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return toDateInputValue(d);
}

function defaultExportEndDate(): string {
  return toDateInputValue(new Date());
}

const ExportDiaryEntries: Component = () => {
  const [{ accessToken }] = useAuth();

  const [exportAllDates, setExportAllDates] = createSignal(false);
  const [exportStartDate, setExportStartDate] = createSignal(
    defaultExportStartDate(),
  );
  const [exportEndDate, setExportEndDate] = createSignal(
    defaultExportEndDate(),
  );

  const handleExport = async (): Promise<void> => {
    let startDate: string | undefined;
    let endDate: string | undefined;
    if (!exportAllDates()) {
      startDate = new Date(exportStartDate() + "T00:00:00").toISOString();
      endDate = new Date(exportEndDate() + "T23:59:59.999").toISOString();
    }
    const responseData: {
      data: { food_diary_diary_entry: EntryRecord[] };
    } = await fetchExportEntries(accessToken(), startDate, endDate);
    const data: string = entriesToCsv(responseData.data.food_diary_diary_entry);
    const blob: Blob = new Blob([data], { type: "text/csv" });
    const url: string = URL.createObjectURL(blob);

    const a: HTMLAnchorElement = document.createElement("a");
    a.href = url;
    a.download = "food-diary-entries.csv";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <div class="flex flex-col">
      <h1 class="font-semibold text-xl mb-4">Export Entries</h1>
      <div class="flex flex-col gap-3 max-w-sm">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={exportAllDates()}
            onChange={(e) => setExportAllDates(e.currentTarget.checked)}
          />
          <span>All dates</span>
        </label>
        <label class="flex justify-between items-center">
          <span>From</span>
          <input
            type="date"
            value={exportStartDate()}
            disabled={exportAllDates()}
            onInput={(e) => setExportStartDate(e.currentTarget.value)}
            class="border border-slate-300 rounded px-2 py-1 disabled:opacity-50"
          />
        </label>
        <label class="flex justify-between items-center">
          <span>To</span>
          <input
            type="date"
            value={exportEndDate()}
            disabled={exportAllDates()}
            onInput={(e) => setExportEndDate(e.currentTarget.value)}
            class="border border-slate-300 rounded px-2 py-1 disabled:opacity-50"
          />
        </label>
        <button
          onClick={handleExport}
          class="bg-indigo-600 text-white rounded px-4 py-2 hover:bg-indigo-700"
        >
          Export As CSV
        </button>
      </div>
      <div class="mt-4">
        <ButtonLink href="/profile">Back to profile</ButtonLink>
      </div>
    </div>
  );
};

export default ExportDiaryEntries;
