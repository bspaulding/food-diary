import type { Component } from "solid-js";

type Props = {
  class?: string;
  date: Date;
};

const DateBadge: Component<Props> = (props: Props) => (
  <div class={`${props.class || ""} text-center text-xl font-semibold`}>
    <p class="text-4xl">{dayOfMonth.format(props.date)}</p>
    <p class="uppercase">{month.format(props.date)}</p>
  </div>
);

export default DateBadge;

const dayOfMonth = new Intl.DateTimeFormat("en-US", { day: "numeric" });
const month = new Intl.DateTimeFormat("en-US", { month: "short" });
