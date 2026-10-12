// Run with: node scripts/check-wall-performance.cjs
// Exercise serialized Expo worklets and compile both real SkSL variants. Native
// drawing is stubbed: these checks do not measure device FPS or visual quality.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const root = path.resolve(__dirname, "../src/components/neon-renderer");
function load(name, modules, platform = "android", isDev = true) {
    const filename = path.join(root, name);
    const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
        filename, babelrc: false, configFile: false, presets: ["babel-preset-expo"],
        caller: { name: "metro", platform, isDev, supportsStaticESM: false, supportsReactCompiler: true },
    });
    const runtime = vm.createContext({
        exports: {}, console,
        require: name => { assert.ok(modules[name], name); return modules[name]; },
    });
    runtime.global = runtime;
    vm.runInContext(code, runtime);
    return runtime.exports;
}

const compiler = { c: size => Array(size).fill(Symbol.for("react.memo_cache_sentinel")) };
const presets = load("render-quality.ts", {}).RENDER_QUALITY;
const shader = load("wall-shader.ts", {});

function check(platform, isDev, quality, refreshRate, focused = true) {
    let rendering = false;
    let renderReads = 0;
    const derived = [];
    const effects = [];
    const frames = [];
    const listeners = new Set();
    const imageSources = [];
    const ui = vm.createContext({});
    ui.global = ui;
    function onUI(fn) {
        assert.ok(fn.__workletHash, "Callback must be a worklet");
        const closure = { ...fn.__closure };
        for (const [key, value] of Object.entries(closure)) {
            if (typeof value !== "function") continue;
            closure[key] = value.__workletHash ? onUI(value) : () => {
                throw new Error("Captured non-worklet: " + key);
            };
        }
        return vm.runInContext("(" + fn.__initData.code + ")", ui).bind({ __closure: closure });
    }
    function shared(initial) {
        let current = initial;
        return {
            writes: 0,
            get value() { if (rendering) renderReads++; return current; },
            set value(next) { current = next; this.writes++; },
            modify(fn) { current = fn(current); this.writes++; },
        };
    }
    const AppState = {
        currentState: "active",
        addEventListener: (_, fn) => {
            listeners.add(fn);
            return { remove: () => listeners.delete(fn) };
        },
    };
    const jsx = (type, props) => ({ type, props });
    const modules = {
        react: { useEffect: fn => effects.push(fn) },
        "react/compiler-runtime": compiler,
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "react/jsx-dev-runtime": { jsxDEV: jsx },
        "react-native": { AppState },
        "expo-router": { useIsFocused: () => focused },
        "react-native-reanimated": {
            useSharedValue: shared,
            useDerivedValue: fn => {
                const sv = shared(undefined);
                derived.push({ fn, sv });
                return sv;
            },
            useFrameCallback: (fn, autostart) => {
                const frame = { active: autostart, setActive(active) { this.active = active; } };
                frames.push({ fn, frame });
                return frame;
            },
        },
        "@shopify/react-native-skia": {
            Canvas: "Canvas", Fill: "Fill", Shader: "Shader", ImageShader: "ImageShader",
            Skia: { RuntimeEffect: { Make: () => ({}) } },
            useImage: source => { imageSources.push(source); return source ? { width: () => 256, height: () => 256 } : null; },
        },
        "./render-quality": { RENDER_QUALITY: presets },
        "./wall-shader": shader,
    };
    modules["./useWallLighting"] = load("useWallLighting.ts", modules, platform, isDev);
    const { BrickBackground } = load("BrickBackground.tsx", modules, platform, isDev);
    const lights = shared([{ id: "tube", emitters: [20, 140], r: 1, g: 0, b: 0, intensity: 1 }]);
    const intensity = shared({ tube: 2 });
    const scroll = shared(100);
    rendering = true;
    const tree = BrickBackground({
        lightsShared: lights, intensityShared: intensity, scrollShared: scroll,
        width: 390, height: 844, quality,
        textures: { albedo: "albedo", normalMap: "normal", roughnessMap: "roughness" },
    });
    rendering = false;
    assert.equal(renderReads, 0, "No shared-value reads during React render");
    assert.equal(tree.props.style.width, 390 * presets[quality].wallRenderScale);
    assert.equal(imageSources[2], quality === "full" ? "roughness" : null);
    assert.equal(derived.length, 2);
    const [live, uniforms] = derived;
    const updateLive = () => { live.sv.value = onUI(live.fn)(); };
    updateLive();
    const selected = uniforms.fn.__closure.lighting;
    assert.ok(selected, "Uniforms must capture the selected lighting buffer");
    for (const input of [lights, intensity, scroll]) {
        assert.ok(!Object.values(uniforms.fn.__closure).includes(input), "Uniforms must not subscribe to raw inputs");
    }
    const cleanups = effects.map(fn => fn());
    const { frame, fn } = frames[0];
    const tick = timestamp => { if (frame.active) onUI(fn)({ timestamp }); };
    if (!focused) {
        assert.equal(frame.active, false);
        cleanups.forEach(fn => fn());
        return;
    }
    if (quality === "full") {
        assert.equal(frame.active, false, "Full quality needs no sampling callback");
        assert.equal(selected, live.sv);
        intensity.modify(map => { map.tube = 0; return map; });
        updateLive();
        assert.equal(selected.value.intensities.tube, 0);
    } else {
        tick(0);
        assert.equal(selected.value.scroll, 100);
        const before = selected.value;
        intensity.modify(map => { map.tube = 0; return map; });
        updateLive();
        tick(1);
        assert.equal(selected.value, before);
        assert.equal(before.intensities.tube, 2, "In-place updates must not mutate a held snapshot");
        tick(1000 / 30);
        assert.equal(selected.value.intensities.tube, 0, "Publish the final update even after inputs stop");
        const settledWrites = selected.writes;
        tick(100); tick(200);
        assert.equal(selected.writes, settledWrites, "Static lighting must not redraw");

        const startWrites = selected.writes;
        for (let i = 0; i < refreshRate; i++) {
            intensity.modify(map => { map.tube = i / refreshRate; return map; });
            scroll.value = i;
            updateLive();
            tick(300 + i * 1000 / refreshRate);
        }
        assert.equal(selected.writes - startWrites, 30, `30 updates on a ${refreshRate} Hz display`);
        tick(1400);
        assert.equal(selected.value.scroll, refreshRate - 1);
        assert.equal(selected.value.intensities.tube, (refreshRate - 1) / refreshRate);
        lights.value = [{ ...lights.value[0], r: 0, g: 1 }];
        updateLive(); tick(1500);
        uniforms.sv.value = onUI(uniforms.fn)();
        assert.equal(uniforms.sv.value.emitterColors[1], 1);
        assert.equal(uniforms.sv.value.emitters[1], 140 - (refreshRate - 1));

        AppState.currentState = "background";
        listeners.forEach(fn => fn());
        assert.equal(frame.active, false);
        scroll.value = 999;
        updateLive(); tick(1501);
        assert.notEqual(selected.value.scroll, 999);
        AppState.currentState = "active";
        listeners.forEach(fn => fn());
        tick(1502);
        assert.equal(selected.value.scroll, 999, "Resume flushes the latest lighting immediately");
    }
    uniforms.sv.value = onUI(uniforms.fn)();
    assert.equal(uniforms.sv.value.screenScale, 1 / presets[quality].wallRenderScale);
    assert.ok(uniforms.sv.value.emitters.every(Number.isFinite));
    cleanups.forEach(fn => fn());
    assert.equal(frame.active, false);
    assert.equal(listeners.size, 0);
}

async function main() {
    for (const platform of ["android", "ios"]) {
        for (const isDev of [true, false]) {
            for (const quality of ["full", "performance"]) {
                for (const hz of [60, 120]) check(platform, isDev, quality, hz);
            }
            check(platform, isDev, "performance", 60, false);
            console.log(`PASS: ${platform} ${isDev ? "development" : "production"} wall sampling, lifecycle, uniforms and compiler boundaries`);
        }
    }
    const CanvasKit = await require("canvaskit-wasm")({
        locateFile: file => require.resolve("canvaskit-wasm/bin/" + file),
    });
    for (const specular of [true, false]) {
        const source = shader.buildWallShader(specular);
        if (!specular) {
            assert.ok(!source.includes("roughnessMap"));
            assert.ok(!source.includes("pow("));
        }
        const effect = CanvasKit.RuntimeEffect.Make(source);
        assert.ok(effect, "SkSL must compile");
        effect.delete();
    }
    console.log("PASS: full and performance shaders compile in Skia");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
