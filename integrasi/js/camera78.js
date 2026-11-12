// Camera shots for scenes 7 and 8 (global timeline seconds).
// These scenes are driven by the same deterministic Enguarde state as the animation,
// so seeking and pausing keep the camera in sync with the action.

import {
    SCENE6_SPLASH,
    SCENE7_START,
    SCENE8_START,
    SCENE9_START,
    SEA_Y,
    clamp,
    lerp3,
    seg
} from "./timeline.js";
import { enguardeState } from "./enguarde_bridge.js";

const ease = (t) => t * t * (3 - 2 * t);
const smooth = (T, a, b) => ease(seg(T, a, b));
const mix = (a, b, t) => lerp3(a, b, t);

const DK_FLOAT = [SCENE6_SPLASH.x, SEA_Y - 1.45, SCENE6_SPLASH.z];
const DK_LOOK = [DK_FLOAT[0], SEA_Y + 0.45, DK_FLOAT[2]];

function scene7Shot(T, fish) {
    // Match the wide ocean view used at the end of scene 6, then move into a
    // water-level two-shot as Enguarde reaches DK.
    const oldEye = [DK_FLOAT[0] - 14, 4.5, DK_FLOAT[2] - 24];
    const fishLook = [fish.x, fish.y + 0.7, fish.z];
    const pairLook = mix(DK_LOOK, fishLook, 0.5);
    const approach = smooth(T, 62.5, 66.5);
    const target = mix(DK_LOOK, pairLook, approach);

    const nearEye = [target[0] - 11, SEA_Y + 2.8, target[2] - 16];
    const eye = mix(oldEye, nearEye, approach);

    return { eye, target, shot: "s7-enguarde-approach" };
}

function scene8Shot(T, fish) {
    // Enguarde faces +X in model space. Keep a side/rear angle that shows DK
    // on his back while retaining enough height to see the breach and roll.
    const forward = [Math.cos(fish.yaw), -Math.sin(fish.yaw)];
    const side = [Math.sin(fish.yaw), Math.cos(fish.yaw)];
    const lift = Math.max(0, fish.y - (SEA_Y - 0.12));

    const chaseEye = [
        fish.x - forward[0] * 14 + side[0] * 8,
        fish.y + 5.2 + lift * 0.45,
        fish.z - forward[1] * 14 + side[1] * 8
    ];
    const chaseTarget = [
        fish.x + forward[0] * 2.4,
        fish.y + 0.65,
        fish.z + forward[1] * 2.4
    ];

    // Blend from the scene-7 two-shot rather than snapping at the scene cut.
    const blend = smooth(T, SCENE8_START, SCENE8_START + 1.4);
    const before = scene7Shot(T, fish);

    return {
        eye: mix(before.eye, chaseEye, blend),
        target: mix(before.target, chaseTarget, blend),
        shot: "s8-enguarde-rescue-chase"
    };
}

export function cameraOverride(T) {
    if (!Number.isFinite(T) || T < SCENE7_START || T >= SCENE9_START) {
        return null;
    }

    const fish = enguardeState(clamp(T, SCENE7_START, SCENE9_START));
    return T < SCENE8_START ? scene7Shot(T, fish) : scene8Shot(T, fish);
}
