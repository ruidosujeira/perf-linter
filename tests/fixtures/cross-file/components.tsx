import { memo } from './memo';

export function FancyButton(props: { onPress: () => void }): JSX.Element {
  return <button onClick={props.onPress}>Press</button>;
}

export const MemoFancyButton = memo(FancyButton);

export function useDataSource(): Promise<number> {
  return Promise.resolve(10);
}
