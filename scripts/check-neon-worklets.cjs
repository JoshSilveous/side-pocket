// Run with: node scripts/check-neon-worklets.cjs
// Exercise serialized UI worklets after Expo's actual React Compiler transform.
// Native drawing is stubbed; this checks the JS/UI boundary, not GPU rendering.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const filename = path.resolve(__dirname, "../src/components/neon-renderer/DustParticles.tsx");
const source = fs.readFileSync(filename, "utf8");

function check(input, platform, isDev) {
    const { code } = babel.transformSync(input, {
        filename,
        babelrc: false,
        configFile: false,
        presets: ["babel-preset-expo"],
        caller: {
            name: "metro",
            platform,
            isDev,
            supportsStaticESM: false,
            supportsReactCompiler: true,
        },
    });
    let rendering = false;
    let renderReads = 0;
    const shared = [];
    const derived = [];
    const callbacks = {};
    const ui = vm.createContext({});
    ui.global = ui;

    function onUI(fn) {
        assert.ok(fn.__workletHash, "UI callback must be a worklet");
        const closure = { ...fn.__closure };
        for (const [key, value] of Object.entries(closure)) {
            if (typeof value !== "function") continue;
            closure[key] = value.__workletHash ? onUI(value) : () => {
                throw new Error("Captured non-worklet function: " + key);
            };
        }
        const worklet = vm.runInContext("(" + fn.__initData.code + ")", ui);
        return worklet.bind({ __closure: closure });
    }

    function sharedValue(initial) {
        let current = initial;
        return {
            get value() { if (rendering) renderReads++; return current; },
            set value(value) { current = value; },
            modify(fn) { current = onUI(fn)(current); },
        };
    }

    const jsx = () => null;
    const modules = {
        react: { memo: (fn) => fn, useMemo: (fn) => fn(), useEffect: () => {} },
        "react/compiler-runtime": { c: (size) => Array(size).fill(Symbol.for("react.memo_cache_sentinel")) },
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "react/jsx-dev-runtime": { jsxDEV: jsx },
        "expo-router": { useIsFocused: () => true },
        "react-native": { AppState: {} },
        "react-native-reanimated": {
            useSharedValue: (value) => { const sv = sharedValue(value); shared.push(sv); return sv; },
            useFrameCallback: (fn) => { callbacks.frame = fn; return {}; },
            useDerivedValue: (fn) => { const sv = sharedValue(undefined); derived.push([fn, sv]); return sv; },
        },
        "@shopify/react-native-skia": {
            Skia: { XYWHRect: () => ({}) },
            useTexture: () => ({}),
            useRSXformBuffer: (_, fn) => { callbacks.transform = fn; return {}; },
            useColorBuffer: (_, fn) => { callbacks.color = fn; return {}; },
        },
    };
    const runtime = vm.createContext({
        exports: {},
        require: (name) => { assert.ok(modules[name], name); return modules[name]; },
    });
    runtime.global = runtime;
    vm.runInContext(code, runtime);
    rendering = true;
    runtime.exports.DustParticles({
        width: 390,
        height: 844,
        lightsShared: sharedValue([{ id: "tube", emitters: [20, 140], r: 1, g: 0, b: 0, intensity: 1 }]),
        intensityShared: sharedValue({ tube: 2 }),
        scrollShared: sharedValue(100),
    });
    rendering = false;
    assert.equal(renderReads, 0, "Compiler must not read shared values during render");
    for (const [fn, sv] of derived) sv.value = onUI(fn)();

    const particles = shared[0].value;
    Object.assign(particles[0], { x: 20, y: 40 });
    Object.assign(particles[1], { x: 380, y: 800 });
    const color = onUI(callbacks.color);
    const hot = [], ambient = [];
    color(hot, 0);
    color(ambient, 1);
    assert.deepEqual(hot, [1, 1, 1, 1]);
    assert.deepEqual(ambient, [0.55, 0.55, 0.55, 0.02]);
    onUI(callbacks.frame)({ timeSincePreviousFrame: 40 });
    assert.equal(shared[0].value, particles, "Simulation should retain its array");
    onUI(callbacks.transform)({ set: (...values) => assert.ok(values.every(Number.isFinite)) }, 0);
    for (let i = 0; i < particles.length; i++) {
        const rgba = [];
        color(rgba, i);
        assert.ok(rgba.every(Number.isFinite));
    }
}

for (const platform of ["android", "ios"]) {
    for (const isDev of [true, false]) {
        check(source, platform, isDev);
        console.log(`PASS: ${platform} ${isDev ? "development" : "production"} worklets with React Compiler enabled`);
    }
}

// Prove this check catches the original compiler regression.
assert.throws(
    () => check(source.replace('"use no memo";', ""), "android", true),
    /shared values during render|Captured non-worklet/,
);
console.log("PASS: regression reproduced when the component opt-out is removed");
