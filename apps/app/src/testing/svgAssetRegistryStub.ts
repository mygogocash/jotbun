// Render tests only: never import this from app code.
//
// react-native-svg's web build resolves image `href`s through
// `@react-native/assets-registry/registry`, which React Native 0.87+ no longer
// ships and only Metro provides, so vitest cannot load it.
// `vitest.render.config.ts` aliases that one module to this file. The real
// resolver and the real SVG elements still run; the kit and the bun draw no
// images, so no asset is ever looked up. If a test ever draws a bundled image,
// the resolver throws "asset … could not be found" instead of passing quietly.
//
// The app bundle never sees this file: Metro resolves the registry itself, and
// `svgAssetRegistryStub.test.ts` fails if any app file imports it.

/** The asset registry's lookup, with no assets registered. */
export function getAssetByID(_assetId: number): undefined {
  return undefined;
}
