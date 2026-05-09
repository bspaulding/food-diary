type Accessors<T> = {
  [P in keyof T]: () => T[P];
};

export function accessorsToObject<T extends Record<string, unknown>>(
  accessors: Accessors<T>,
): T {
  type AccessorFunc = () => unknown;
  const entries = Object.entries(accessors) as Array<[string, AccessorFunc]>;
  return entries.reduce<Partial<T>>((acc, [k, accessor]) => {
    return {
      ...acc,
      [k]: accessor(),
    };
  }, {}) as T;
}

const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });
export function parseAndFormatTime(timestamp: string): string {
  return timeFormat.format(new Date(timestamp));
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "full" });
export function parseAndFormatDay(timestamp: string): string {
  return dateFormat.format(new Date(timestamp));
}

export const pluralize = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
