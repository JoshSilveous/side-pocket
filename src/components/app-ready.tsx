import { createContext, useContext } from "react";

/** True once the native splash has hidden and the wall is drawn — start intros then. */
export const AppReadyContext = createContext(false);

export function useAppReady(): boolean {
    return useContext(AppReadyContext);
}
