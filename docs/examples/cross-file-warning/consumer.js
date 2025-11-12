import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FancyButton, MemoFancyButton, useDataSource } from './components';
export function Screen() {
    const handleClick = () => {
        console.log('clicked');
    };
    return (_jsxs("div", { children: [_jsx(FancyButton, { onPress: handleClick }), _jsx(MemoFancyButton, { onPress: () => handleClick() })] }));
}
export async function loadScreen() {
    await useDataSource();
}
export function triggerLoad() {
    useDataSource();
}
