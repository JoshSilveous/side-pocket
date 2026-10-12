export type RenderQuality = "full" | "performance";

// Full quality is the default. Enable for Android testing; a future settings
// page can select either preset through NeonRenderer's quality prop.
export const ANDROID_PERFORMANCE_MODE = false;

export const RENDER_QUALITY = {
    full: {
        particleCount: 640,
        wallRenderScale: 0.75,
        wallLightingFps: 0, // Follow every lighting update.
        wallSpecular: true,
    },
    performance: {
        particleCount: 160,
        wallRenderScale: 0.5,
        wallLightingFps: 30,
        wallSpecular: false,
    },
} as const;
