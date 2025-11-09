import { NonMemoSpreadChild } from './targets';

export function Example(): JSX.Element {
  const props = { config: { label: 'ok' } };
  return <NonMemoSpreadChild {...props} />;
}
