# Side Pocket

A mobile pool (billiards) tracking app — games, teams, players, turn order, and
score history — built around a fully custom **neon bar / billiards-hall**
aesthetic (neon signs on a brick wall, real-time Skia lighting).

## Stack

- **Expo** (dev client) + **Expo Router** (file-based, `src/app/`)
- **React Native** 0.85 (new architecture / Fabric)
- **@shopify/react-native-skia** — all neon glow, wall shader, particles
- **Reanimated** — animation + lighting on the UI thread
- **TypeScript** (strict)

## Develop

```bash
npm install
npm start        # Metro bundler (runs gen:svg first)
```

Build the iOS dev client on a Mac and point it at the Windows Metro IP. See
`CLAUDE.md` for the full architecture notes (NeonRenderer, lighting model,
performance tuning).

## Project layout

```
src/
  app/            Expo Router screens (single persistent surface; no nav bar)
  components/     Neon primitives, renderer, dev menu
  constants/      theme tokens
  hooks/
scripts/
  svg-to-neon.mjs Build-time SVG → neon path codegen
```

## Dev menu

There's no nav bar. Press and hold with **three fingers** (~600ms) anywhere to
open a hidden dev menu (UI sandbox, splash animation). Remove before shipping.
