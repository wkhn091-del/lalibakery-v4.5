// GPU resources that outlive a canvas. The loaders keep their textures cached (the cake's maps, the
// studio's HDRI), so a return to the page doesn't fetch and decode them again, and the macarons'
// micro-surface map is made once. But every renderer that draws one of them leaves a listener on it,
// and through that listener the whole renderer (its shader programs, its canvas) stays in memory
// after its canvas is gone: one more with every return to the page.
//
// So they're released once the scene has left its canvas for good (HeroScene's Driver, as it goes:
// nothing can draw them after that), and again when the scene comes back, in case a canvas from an
// earlier visit still holds on to one. A canvas swapped after a lost graphics context doesn't
// release them: the new one is already drawing them. Releasing is three.js's dispose(): every
// renderer that uploaded the resource lets go of it, the GPU copy is freed, and the next canvas
// uploads it again from the data the cache still holds, as a new canvas must anyway.

type Disposable = { dispose(): void };
const shared = new Set<Disposable>();

/** Marks a resource as outliving the canvas: it's released with the scene rather than with its component */
export function keepShared(resource: Disposable): void {
  shared.add(resource);
}

/** Has every renderer that drew them let go of them (HeroScene: on arrival, and once it has left its canvas) */
export function releaseShared(): void {
  shared.forEach((resource) => resource.dispose());
}
