import type { Component } from "solid-js";
import { useAuth } from "./Auth0";
import { createSignal } from "solid-js";
import { format, parse, formatISO, parseISO } from "date-fns";
import { Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import createAuthorizedResource from "./createAuthorizedResource";
import type { DiaryEntry } from "./Api";
import {
  getDiaryEntry,
  updateDiaryEntry,
  GraphQLError as ApiGraphQLError,
} from "./Api";
import ButtonLink from "./ButtonLink";

interface GraphQLError {
  message: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface GetDiaryEntryResponse {
  food_diary_diary_entry_by_pk: DiaryEntry;
}

const DiaryEntryEditForm: Component = () => {
  const params = useParams();
  const [{ accessToken }] = useAuth();
  const [diaryEntryQuery] = createAuthorizedResource(
    () => params.id,
    (token: string, id: string) => getDiaryEntry(token, id),
  );
  const [consumedAt, setConsumedAt] = createSignal<string | undefined>(
    undefined,
  );
  const [servings, setServings] = createSignal<number | undefined>(undefined);
  const [disabled, setDisabled] = createSignal(false);
  const [errors, setErrors] = createSignal<string[]>([]);
  const navigate = useNavigate();

  const diaryEntry = (): DiaryEntry | undefined =>
    (diaryEntryQuery() as GraphQLResponse<GetDiaryEntryResponse> | undefined)
      ?.data?.food_diary_diary_entry_by_pk;
  const href = (): string =>
    diaryEntry()?.nutrition_item
      ? `/nutrition_item/${diaryEntry()?.nutrition_item?.id}`
      : `/recipe/${diaryEntry()?.recipe?.id ?? 0}`;
  return (
    <>
      <div class="flex space-x-4 mb-4">
        <ButtonLink href="/">Back to Diary</ButtonLink>
      </div>
      <Show when={errors().length}>
        <pre class="text-red-600">{errors().join("\n")}</pre>
      </Show>
      <Show when={diaryEntry()?.id}>
        <div class="mb-4">
          <p class="text-2xl">
            {diaryEntry()?.nutrition_item?.description ||
              diaryEntry()?.recipe?.name}
          </p>
          <p class="text-indigo-600">
            <a href={href()}>View Detail</a>
          </p>
        </div>
        <form>
          <fieldset class="flex flex-col">
            <label for="servings">Servings</label>
            <input
              id="servings"
              type="number"
              inputmode="decimal"
              step="0.1"
              value={diaryEntry()?.servings ?? 0}
              onInput={(e: InputEvent & { target: HTMLInputElement }) => {
                const parsed: number = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  setServings(parsed);
                }
              }}
            />
          </fieldset>
          <fieldset class="flex flex-col">
            <label for="consumed_at">Consumed At</label>
            <input
              id="consumed_at"
              type="datetime-local"
              value={format(
                parseISO(diaryEntry()?.consumed_at ?? new Date().toISOString()),
                "yyyy-MM-dd'T'HH:mm",
              )}
              onChange={(e: Event & { target: HTMLInputElement }) =>
                setConsumedAt(e.target.value)
              }
            />
          </fieldset>
          <fieldset class="mt-4 mb-4">
            <button
              class="bg-indigo-600 text-slate-50 py-3 w-full text-xl font-semibold"
              disabled={disabled()}
              onClick={async (): Promise<void> => {
                setErrors([]);
                if (consumedAt() === undefined && servings() === undefined) {
                  navigate("/");
                  return;
                }
                setDisabled(true);

                const entry: DiaryEntry | undefined = diaryEntry();
                if (!entry) return;

                const newConsumedAt: string =
                  consumedAt() !== undefined && consumedAt() !== null
                    ? formatISO(
                        parse(
                          consumedAt() ?? "",
                          "yyyy-MM-dd'T'HH:mm",
                          new Date(),
                        ),
                      )
                    : entry.consumed_at;

                const newServings: number =
                  servings() !== undefined && servings() !== null
                    ? (servings() ?? entry.servings)
                    : entry.servings;

                try {
                  const response: GraphQLResponse<unknown> =
                    await updateDiaryEntry(accessToken(), {
                      id: entry.id,
                      consumedAt: newConsumedAt,
                      servings: newServings,
                    });
                  console.log(response.errors);
                  if (response.errors) {
                    console.debug(response.errors);
                    setDisabled(false);
                    setErrors(
                      response.errors
                        .filter((e: GraphQLError) => e.message)
                        .map((e: GraphQLError) => e.message),
                    );
                  } else {
                    setErrors([]);
                    navigate("/");
                  }
                } catch (e: unknown) {
                  console.debug(e);
                  setDisabled(false);
                  // Handle GraphQLError from fetchQuery
                  if (e instanceof ApiGraphQLError) {
                    const errorMessages = e.errors
                      .filter(
                        (err: unknown): err is { message: string } =>
                          typeof err === "object" &&
                          err !== null &&
                          "message" in err &&
                          typeof (err as { message: unknown }).message ===
                            "string",
                      )
                      .map((err) => err.message);
                    setErrors(errorMessages);
                  } else if (e instanceof Error) {
                    setErrors([e.message]);
                  } else {
                    setErrors(["An unexpected error occurred"]);
                  }
                }
              }}
            >
              {disabled() ? "Saving..." : "Save"}
            </button>
          </fieldset>
        </form>
      </Show>
    </>
  );
};

export default DiaryEntryEditForm;
