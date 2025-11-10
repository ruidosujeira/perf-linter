import { FancyButton } from './components';

const sharedHandler = () => {
  console.log('shared handler');
};

const forwardedProps = {
  onPress: sharedHandler
};

export function SpreadConsumer(): JSX.Element {
  return (
    <div>
      <FancyButton
        {...{
          onPress: () => {
            console.log('inline spread handler');
          }
        }}
      />
      <FancyButton
        {...{
          onPress: sharedHandler
        }}
      />
      <FancyButton
        {...{
          label: 'spread label'
        }}
      />
      <FancyButton
        {...{
          ...{
            onPress: () => {
              console.log('nested inline spread');
            }
          },
          ...forwardedProps
        }}
      />
    </div>
  );
}
