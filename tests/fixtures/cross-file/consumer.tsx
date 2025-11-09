import { FancyButton, MemoFancyButton, useDataSource } from './components';

export function Screen(): JSX.Element {
  const handleClick = () => {
    console.log('clicked');
  };

  return (
    <div>
      <FancyButton onPress={handleClick} />
      <MemoFancyButton onPress={() => handleClick()} />
    </div>
  );
}

export async function loadScreen(): Promise<void> {
  await useDataSource();
}

export function triggerLoad(): void {
  useDataSource();
}
