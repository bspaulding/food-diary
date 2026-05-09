import type { Component } from "solid-js";

type Props = {
  children: string;
  class?: string;
  href: string;
};

const ButtonLink: Component<Props> = (props: Props) => (
  <a
    class={`bg-indigo-600 text-slate-50 py-2 px-3 text-lg rounded-md ${props["class"]}`}
    href={props.href}
  >
    {props.children}
  </a>
);

export default ButtonLink;
