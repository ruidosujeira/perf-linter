import { jsx as _jsx } from "react/jsx-runtime";
import { memo } from './memo';
export function FancyButton(props) {
    return _jsx("button", { onClick: props.onPress, children: "Press" });
}
export const MemoFancyButton = memo(FancyButton);
export function useDataSource() {
    return Promise.resolve(10);
}
