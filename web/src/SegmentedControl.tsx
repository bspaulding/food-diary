import type { Component, JSX } from "solid-js";
import { createSignal, For } from "solid-js";

type Props = {
  segments: string[];
  children: (segment: string) => JSX.Element;
};

const SegmentedControl: Component<Props> = (props: Props) => {
  const [currentSegment, setCurrentSegment] = createSignal<string>(
    props.segments[0],
  );
  return (
    <div>
      <ul class="flex flex-row justify-center mb-2">
        <For each={props.segments}>
          {(segment: string, i: () => number) => (
            <li
              class={`px-3 py-1 bg-slate-200 border border-slate-500 ${
                i() === 0 && "rounded-l-full"
              }
              ${i() === props.segments.length - 1 && "rounded-r-full"}
              ${
                currentSegment() === segment &&
                "bg-slate-500 text-slate-50 shadow-inner cursor-default"
              }
              ${currentSegment() !== segment && "cursor-pointer"}`}
              onClick={() => setCurrentSegment(segment)}
            >
              {segment}
            </li>
          )}
        </For>
      </ul>
      <div>{props.children(currentSegment())}</div>
    </div>
  );
};

export default SegmentedControl;
