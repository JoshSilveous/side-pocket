import { createContext, useContext, useEffect, useState } from "react";
import {
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";

/**
 * The "power on" glitch as keyframes — `[durationMs, targetValue]`, starting from
 * 0. Single source of truth for every tube: the sign's power-on and tap ripples,
 * and screen power-ons all read it.
 */
export const GLITCH_KEYFRAMES: readonly (readonly [number, number])[] = [
    [70, 0.55], // first surge
    [60, 0.05], // flicker off
    [70, 0.9], // surge again
    [50, 0.18], // brief dip
    [160, 1], // settle fully on
];

/** Brightness 0 → 1 with a couple of brief flickers, like a tube warming up. */
export function powerOnAnimation() {
    return withSequence(
        ...GLITCH_KEYFRAMES.map(([duration, value]) =>
            withTiming(value, { duration }),
        ),
    );
}

/** Each tube in a scope waits a random delay in this range before glitching on. */
const STAGGER_MIN_MS = 0;
const STAGGER_MAX_MS = 420;

export type PowerOnScope = {
    isOn: () => boolean;
    subscribe: (fn: () => void) => () => void;
    /** Power everything in the scope on (once). */
    fire: () => void;
};

export function createPowerOnScope(startOff: boolean): PowerOnScope {
    let on = !startOff;
    const subs = new Set<() => void>();
    return {
        isOn: () => on,
        subscribe: (fn) => {
            subs.add(fn);
            return () => {
                subs.delete(fn);
            };
        },
        fire: () => {
            if (on) return;
            on = true;
            subs.forEach((fn) => fn());
        },
    };
}

export const PowerOnContext = createContext<PowerOnScope | null>(null);

/**
 * A tube's power level (0 → 1). Inside a scope that starts off, it waits dark
 * and glitches on with its own random delay when the scope fires — so every
 * tube/label in a screen comes on independently. Always 1 outside a scope.
 * Multiply it into the tube's brightness (visual AND light).
 */
export function usePowerOnLevel(): SharedValue<number> {
    const scope = useContext(PowerOnContext);
    const level = useSharedValue(scope && !scope.isOn() ? 0 : 1);
    useEffect(() => {
        if (!scope) return;
        const powerOn = () => {
            const delay =
                STAGGER_MIN_MS + Math.random() * (STAGGER_MAX_MS - STAGGER_MIN_MS);
            level.value = withDelay(delay, powerOnAnimation());
        };
        // Mounted after the scope already fired → still come on.
        if (scope.isOn() && level.value === 0) powerOn();
        return scope.subscribe(powerOn);
    }, [scope, level]);
    return level;
}

/**
 * Children start dark and stagger on as soon as this mounts — for overlays and
 * anything that appears mid-screen (prompts, sheets).
 */
export function PowerOnGroup({ children }: { children: React.ReactNode }) {
    const [scope] = useState(() => createPowerOnScope(true));
    useEffect(() => {
        scope.fire();
    }, [scope]);
    return <PowerOnContext.Provider value={scope}>{children}</PowerOnContext.Provider>;
}
