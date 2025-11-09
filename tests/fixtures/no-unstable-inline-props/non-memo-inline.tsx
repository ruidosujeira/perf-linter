import { NonMemoChild } from './targets';

export function Example(): JSX.Element {
  return <NonMemoChild onClick={() => {}} data={{ value: 1 }} />;
}
