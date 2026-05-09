import type { Component } from "solid-js";
import { createMemo } from "solid-js";
import type { WeeklyTrendsData } from "./Api";
import { fetchWeeklyTrends } from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";
import ButtonLink from "./ButtonLink";

type WeeklyStats = {
  weekStart: string;
  avgCalories: number;
  avgProtein: number;
  avgAddedSugar: number;
};

const Trends: Component = () => {
  const [getTrendsQuery] = createAuthorizedResource((token: string) =>
    fetchWeeklyTrends(token),
  );
  const trendsData = () =>
    getTrendsQuery()?.data?.food_diary_trends_weekly || [];

  const weeklyStats = createMemo<WeeklyStats[]>(() => {
    const data = trendsData();
    if (data.length === 0) return [];

    // Map backend data to our chart format
    return data.map((item: WeeklyTrendsData) => ({
      weekStart: item.week_of_year,
      avgCalories: Math.round(item.calories),
      avgProtein: Math.round(item.protein),
      avgAddedSugar: Math.round(item.added_sugar),
    }));
  });

  const maxCalories = createMemo(() =>
    Math.max(...weeklyStats().map((s: WeeklyStats) => s.avgCalories), 1),
  );
  const maxProtein = createMemo(() =>
    Math.max(...weeklyStats().map((s: WeeklyStats) => s.avgProtein), 1),
  );
  const maxAddedSugar = createMemo(() =>
    Math.max(...weeklyStats().map((s: WeeklyStats) => s.avgAddedSugar), 1),
  );

  const LineChart: Component<{
    data: number[];
    max: number;
    color: string;
    label: string;
  }> = (props: {
    data: number[];
    max: number;
    color: string;
    label: string;
  }) => {
    const points = createMemo(() => {
      const width: number = props.data.length * 80; // 80px per week
      const height: number = 200;
      const padding: number = 20;

      return props.data
        .map((value: number, index: number) => {
          const x: number =
            padding +
            (index * (width - 2 * padding)) /
              Math.max(props.data.length - 1, 1);
          const y: number =
            height - padding - (value / props.max) * (height - 2 * padding);
          return `${x},${y}`;
        })
        .join(" ");
    });

    const width = (): number => props.data.length * 80;

    return (
      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-2">{props.label}</h3>
        <div class="overflow-x-auto">
          <svg
            width={width()}
            height="200"
            class="border border-gray-300 rounded"
          >
            {/* Grid lines */}
            <line
              x1="20"
              y1="180"
              x2={width() - 20}
              y2="180"
              stroke="#e5e7eb"
              stroke-width="1"
            />
            <line
              x1="20"
              y1="100"
              x2={width() - 20}
              y2="100"
              stroke="#e5e7eb"
              stroke-width="1"
            />
            <line
              x1="20"
              y1="20"
              x2={width() - 20}
              y2="20"
              stroke="#e5e7eb"
              stroke-width="1"
            />

            {/* Data line */}
            <polyline
              points={points()}
              fill="none"
              stroke={props.color}
              stroke-width="2"
            />

            {/* Data points */}
            {props.data.map((value: number, index: number) => {
              const x: number =
                20 +
                (index * (width() - 40)) / Math.max(props.data.length - 1, 1);
              const y: number = 180 - (value / props.max) * 160;
              return (
                <g>
                  <circle cx={x} cy={y} r="4" fill={props.color} />
                  <text
                    x={x}
                    y={y - 10}
                    text-anchor="middle"
                    font-size="12"
                    fill="#374151"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {/* Week labels */}
            {(() => {
              const stats: WeeklyStats[] = weeklyStats();
              return stats.map((stat: WeeklyStats, index: number) => {
                const x: number =
                  20 + (index * (width() - 40)) / Math.max(stats.length - 1, 1);
                return (
                  <text
                    x={x}
                    y="195"
                    text-anchor="middle"
                    font-size="10"
                    fill="#6b7280"
                  >
                    {stat.weekStart}
                  </text>
                );
              });
            })()}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">Weekly Nutrition Trends</h1>
        <ButtonLink href="/">Back to Diary</ButtonLink>
      </div>

      {weeklyStats().length === 0 ? (
        <p class="text-slate-400 text-center">
          No data available yet. Add some diary entries to see trends!
        </p>
      ) : (
        <>
          <LineChart
            data={weeklyStats().map((s: WeeklyStats) => s.avgCalories)}
            max={maxCalories()}
            color="#3b82f6"
            label="Average Daily Calories (per week)"
          />
          <LineChart
            data={weeklyStats().map((s: WeeklyStats) => s.avgProtein)}
            max={maxProtein()}
            color="#10b981"
            label="Average Daily Protein (g per week)"
          />
          <LineChart
            data={weeklyStats().map((s: WeeklyStats) => s.avgAddedSugar)}
            max={maxAddedSugar()}
            color="#ef4444"
            label="Average Daily Added Sugar (g per week)"
          />
        </>
      )}
    </div>
  );
};

export default Trends;
