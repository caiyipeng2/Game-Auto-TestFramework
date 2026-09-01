/**
 * Version of the public contracts shared by the generic runner and adapters.
 * Keep this value independent from the package release version so route files
 * can declare the contract they require.
 */
export const FRAMEWORK_CONTRACT_VERSION = "1.0";

export * from "./contracts/device-driver.js";
export * from "./contracts/evidence.js";
export * from "./contracts/flow.js";
export * from "./contracts/game-adapter.js";
