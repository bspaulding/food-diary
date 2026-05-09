import { startOfDay, subDays, subWeeks } from "date-fns";

/**
 * Calculate the number of complete days between two dates (excluding the end date)
 * @param startDate - The start date
 * @param endDate - The end date (not included in the count)
 * @returns The number of complete days, minimum 1
 */
export function calculateDaysBetween(startDate: Date, endDate: Date): number {
  const days = Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, days);
}

/**
 * Calculate average daily calories from a total
 * @param totalCalories - The total calories for the period
 * @param days - The number of days in the period
 * @returns The average daily calories, rounded up
 */
export function calculateDailyAverage(
  totalCalories: number,
  days: number,
): number {
  return Math.ceil(totalCalories / days);
}

/**
 * Calculate the number of complete days in the last 4 weeks (up to but not including today)
 * @param now - The current date/time
 * @returns The number of complete days in the last 4 weeks, up to but not including today
 */
export function calculateFourWeeksDays(now: Date): number {
  const todayStart = startOfDay(now);
  const fourWeeksAgoStart = startOfDay(subWeeks(now, 4));
  return calculateDaysBetween(fourWeeksAgoStart, todayStart);
}
