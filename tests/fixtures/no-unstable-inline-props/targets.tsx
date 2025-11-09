export type NonMemoChildProps = {
  onClick: () => void;
  data: { value: number };
};

export function NonMemoChild(props: NonMemoChildProps): JSX.Element {
  return <div data-value={props.data.value} />;
}

export function memo<T>(component: T): T {
  return component;
}

export const MemoChild = memo(function MemoChild(props: { onClick: () => void }): JSX.Element {
  return <div />;
});

export interface SpreadChildProps {
  config: { label: string };
  onSelect?: () => void;
}

export function NonMemoSpreadChild(props: SpreadChildProps): JSX.Element {
  return <div />;
}
