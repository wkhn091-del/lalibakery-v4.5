"""
Surface textures for the 3D hero cake (public/3d/textures/). Run from the project folder:
    pip install numpy scipy pillow
    python scripts/hero3d-textures.py

Everything is generated (no photos): tiling noise and cellular "air bubble" fields become a
colour map and a normal map (the direction the surface faces at each pixel, which is what
makes light catch every pore). The cut-face texture uses the cake's real dimensions, so if the
layer sizes in components/hero3d/cakeParts.ts change, change CAKE below to match.
"""
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', '3d', 'textures')
os.makedirs(OUT, exist_ok=True)

# Must match CAKE in components/hero3d/cakeParts.ts
CAKE = dict(radius=0.95, layer=0.26, cream=0.055, side=0.045, top_coat=0.05)
COAT_R = CAKE['radius'] + CAKE['side']
STACK_H = CAKE['layer'] * 3 + CAKE['cream'] * 2
COAT_H = STACK_H + CAKE['top_coat']


# ── noise ─────────────────────────────────────────────────────────────────────────────
def value_noise(w, h, cx, cy, seed):
    """Smooth value noise that tiles: cx × cy lattice cells across the image."""
    g = np.random.default_rng(seed).random((cy, cx))
    xs = np.arange(w) * cx / w
    ys = np.arange(h) * cy / h
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    tx = xs - x0
    ty = ys - y0
    sx = (tx * tx * (3 - 2 * tx))[None, :]
    sy = (ty * ty * (3 - 2 * ty))[:, None]
    x1 = (x0 + 1) % cx
    y1 = (y0 + 1) % cy
    x0 %= cx
    y0 %= cy
    a = g[np.ix_(y0, x0)]
    b = g[np.ix_(y0, x1)]
    c = g[np.ix_(y1, x0)]
    d = g[np.ix_(y1, x1)]
    top = a + (b - a) * sx
    bottom = c + (d - c) * sx
    return top + (bottom - top) * sy


def fbm(w, h, cx, cy, seed, octaves=5, gain=0.5):
    total = np.zeros((h, w))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        total += value_noise(w, h, cx * 2 ** o, cy * 2 ** o, seed + 101 * o) * amp
        norm += amp
        amp *= gain
    return total / norm


def bubbles(w, h, cx, cy, seed, density, rmin, rmax, warp=0.0, stretch=1.0, sharp=0.6):
    """Air cells: rounded pits around jittered feature points (tiling), each with its own size.
    Returns pit depth 0…1. `stretch` > 1 elongates them vertically (crumb rises as it bakes)."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cy, cx, 2))
    rad = rmin + (rmax - rmin) * rng.random((cy, cx)) ** 1.6
    active = rng.random((cy, cx)) < density
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    fx = xs * cx / w
    fy = ys * cy / h
    if warp:
        fx = fx + (fbm(w, h, 6, 6, seed + 7, 3) - 0.5) * 2 * warp
        fy = fy + (fbm(w, h, 6, 6, seed + 13, 3) - 0.5) * 2 * warp
    ix = np.floor(fx).astype(int)
    iy = np.floor(fy).astype(int)
    pit = np.zeros((h, w))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx = (ix + dx) % cx
            ny = (iy + dy) % cy
            px = ix + dx + pts[ny, nx, 0]
            py = iy + dy + pts[ny, nx, 1]
            d = np.hypot(fx - px, (fy - py) / stretch)
            t = np.clip(1 - d / rad[ny, nx], 0, 1)
            pit = np.maximum(pit, np.where(active[ny, nx], t ** sharp, 0))
    return pit


def foam(w, h, cx, cy, seed, warp=0.3, stretch=1.0):
    """A foam of cells (tiling): for each pixel, the distances to the nearest and second-nearest
    cell centres (F1, F2). Where F2 − F1 is small the pixel sits on a wall between two cells.
    Returns (F2 − F1, and a random 0…1 value per cell for varying the cells' depth)."""
    rng = np.random.default_rng(seed)
    pts = rng.random((cy, cx, 2))
    val = rng.random((cy, cx))
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    fx = xs * cx / w
    fy = ys * cy / h
    if warp:
        fx = fx + (fbm(w, h, 7, max(1, int(7 * h / w)), seed + 7, 3) - 0.5) * 2 * warp
        fy = fy + (fbm(w, h, 7, max(1, int(7 * h / w)), seed + 13, 3) - 0.5) * 2 * warp
    ix = np.floor(fx).astype(int)
    iy = np.floor(fy).astype(int)
    f1 = np.full((h, w), 9.0)
    f2 = np.full((h, w), 9.0)
    cell = np.zeros((h, w))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx = (ix + dx) % cx
            ny = (iy + dy) % cy
            d = np.hypot(fx - (ix + dx + pts[ny, nx, 0]), (fy - (iy + dy + pts[ny, nx, 1])) / stretch)
            nearer = d < f1
            f2 = np.where(nearer, f1, np.minimum(f2, d))
            cell = np.where(nearer, val[ny, nx], cell)
            f1 = np.minimum(f1, d)
    return f2 - f1, cell


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ── output ────────────────────────────────────────────────────────────────────────────
def normal_map(height, strength, wrap=True):
    """Tangent-space normal map from a height field (x right, y up in texture space)."""
    if wrap:
        dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
        dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(height)
    nx = -dx * strength
    ny = dy * strength  # image rows run down; texture v runs up
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / length, ny / length, nz / length], -1) * 0.5 + 0.5
    return rgb


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a + (b - a) * t


def rgb(hexcode):
    hexcode = hexcode.lstrip('#')
    return np.array([int(hexcode[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def save(name, arr, quality):
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    path = os.path.join(OUT, name)
    img.save(path, 'WEBP', quality=quality, method=6)
    print(f'{name:22s} {img.size[0]}×{img.size[1]}  {os.path.getsize(path) / 1024:6.1f} KB')


def save_height(name, height, blur, wrap=True, size=256):
    """A displacement map: the height field, softened (vertices sit ~1 mm apart on the cake, so
    only the broad bumps can move geometry; the fine pores stay in the normal map) and stretched
    to use the full 0…1 range."""
    from scipy.ndimage import gaussian_filter
    soft = gaussian_filter(height, blur, mode='wrap' if wrap else 'nearest')
    soft = (soft - soft.min()) / max(1e-6, soft.max() - soft.min())
    img = Image.fromarray((soft * 255 + 0.5).astype(np.uint8), 'L').resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, 'WEBP', quality=90, method=6)
    print(f'{name:22s} {img.size[0]}×{img.size[1]}  {os.path.getsize(path) / 1024:6.1f} KB')


# ── crumb: the inside of a vanilla sponge ────────────────────────────────────────────
def crumb_fields(w, h, seed, stretch):
    """Sponge crumb as a foam: thin walls around air cells of varied size and depth, fine cells
    everywhere, larger ones scattered, the odd open hole. Returns (cavity 0…1, height)."""
    def cells(cx, seed_, width, depth_lo, depth_hi, warp):
        edge, value = foam(w, h, cx, max(1, int(cx * h / w)), seed_, warp, stretch)
        # a rounded hollow: 0 on the wall, deepening smoothly all the way to the cell's centre
        interior = np.clip(edge / width, 0, 1) ** 0.75
        walls = 1 + 0.35 * (fbm(w, h, cx, max(1, int(cx * h / w)), seed_ + 9, 2) - 0.5)  # walls of uneven thickness
        return np.clip(interior * walls, 0, 1) * (depth_lo + (depth_hi - depth_lo) * value)
    fine = cells(64, seed + 1, 0.95, 0.3, 0.65, 0.35)
    medium = cells(24, seed + 2, 1.0, 0.05, 0.8, 0.4)  # some medium cells stay shallow, some open up
    holes = bubbles(w, h, 9, max(1, int(9 * h / w)), seed + 3, 0.3, 0.12, 0.3, warp=0.35, stretch=stretch, sharp=0.45)
    cavity = np.clip(np.maximum(fine * 0.8, medium) + 0.8 * holes, 0, 1)
    height = 1 - cavity + 0.05 * (fbm(w, h, 40, max(1, int(40 * h / w)), seed + 4, 3) - 0.5)
    return cavity, height


def crumb_colour(cavity, w, h, seed):
    low = fbm(w, h, 3, max(1, int(3 * h / w)), seed + 5, 4)
    fine = fbm(w, h, 80, max(1, int(80 * h / w)), seed + 6, 2)
    base = mix(rgb('#e2b66c'), rgb('#eecb88'), low)  # golden vanilla crumb, gently uneven
    base = base * (0.975 + 0.05 * fine)[..., None]
    # cell walls catch the light a touch; cavities sit a little in shadow (lighting does the rest)
    return mix(base, rgb('#b07c3e'), cavity ** 1.2 * 0.66)


def crumb():
    w = h = 512
    pits, height = crumb_fields(w, h, 10, 1.0)
    save('crumb-color.webp', crumb_colour(pits, w, h, 10), 90)
    save('crumb-normal.webp', normal_map(height, 7.0), 92)


# ── crust: the outside of a baked layer ──────────────────────────────────────────────
def crust():
    w = h = 512
    low = fbm(w, h, 3, 3, 30, 5)
    mid = fbm(w, h, 12, 12, 31, 4)
    fine = fbm(w, h, 96, 96, 32, 2)
    pores = bubbles(w, h, 140, 140, 33, 0.4, 0.18, 0.4, warp=0.25, sharp=0.8)  # tiny, sparse
    edge, _ = foam(w, h, 48, 48, 36, 0.4)
    skin = 1 - smoothstep(0.0, 0.3, edge)  # the faint cellular pattern baked into the skin
    torn = smoothstep(0.8, 0.86, fbm(w, h, 5, 5, 34, 4))  # the rare spot where it tore on unmoulding
    torn_cavity, _ = crumb_fields(w, h, 35, 1.0)

    base = mix(rgb('#bd7e3c'), rgb('#d39b55'), mid)  # golden brown
    base = mix(base, rgb('#95592a'), smoothstep(0.5, 0.85, low) * 0.55)  # browner where it met the tin
    base = base * (0.96 + 0.08 * fine)[..., None] * (1 - 0.05 * skin)[..., None]
    base = mix(base, rgb('#7d4820'), pores * 0.3)
    inside = crumb_colour(torn_cavity, w, h, 35) * 0.95
    colour = mix(base, inside, torn)

    height = 0.5 + 0.18 * (mid - 0.5) + 0.07 * (fine - 0.5) + 0.06 * skin - 0.22 * pores - 0.2 * torn - 0.25 * torn * torn_cavity
    save('crust-color.webp', colour, 90)
    save('crust-normal.webp', normal_map(height, 4.0), 90)
    save_height('crust-height.webp', height, 6)


# ── buttercream: smoothed with a scraper, with the odd air pocket ────────────────────
def cream():
    w, h = 512, 256
    streaks = fbm(w, h, 3, 40, 50, 4) * 0.6 + fbm(w, h, 6, 90, 51, 3) * 0.4  # long strokes along the cake
    height = 0.5 + 0.35 * (streaks - 0.5)
    rng = np.random.default_rng(52)
    rows = np.arange(h)[:, None]
    for _ in range(14):  # scraper lines: fine ridges that fade in and out along their length
        y = rng.random() * h
        width = 0.6 + rng.random() * 1.2
        ridge = np.exp(-(((rows - y + h / 2) % h - h / 2) ** 2) / (2 * width ** 2))
        fade = smoothstep(0.35, 0.75, value_noise(w, 1, 4, 1, int(rng.integers(1e6)))[0])[None, :]
        height += ridge * fade * (0.12 + rng.random() * 0.15) * (1 if rng.random() > 0.4 else -1)
    air = bubbles(w, h, 60, 30, 53, 0.05, 0.25, 0.55, warp=0.2, sharp=0.8)  # the odd air pocket
    height -= 0.45 * air
    height += 0.03 * (fbm(w, h, 128, 64, 54, 2) - 0.5)
    save('cream-normal.webp', normal_map(height, 3.0), 92)


# ── gold satin: fine threads along the ribbon ────────────────────────────────────────
def satin():
    w, h = 256, 64
    rng = np.random.default_rng(60)
    rows = np.arange(h)[:, None] + np.zeros((1, w))
    threads = 0.5 + 0.5 * np.sin(rows / h * 2 * np.pi * 32)
    per_thread = rng.random(h // 2 + 1)[(rows // 2).astype(int)]
    slub = value_noise(w, h, 24, 32, 61)  # the slight irregularity of real weave
    height = 0.6 * threads + 0.25 * per_thread + 0.15 * slub
    save('satin-normal.webp', normal_map(height, 1.6), 92)


# ── the cut face: sponge, cream and frosting in the cake's real proportions ──────────
def inside():
    w = h = 512
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    u = xs / (w - 1) * COAT_R  # distance from the centre
    v = (h - 1 - ys) / (h - 1) * COAT_H  # height above the plate
    wobble = (fbm(w, h, 8, 8, 70, 3) - 0.5) * 0.012  # cream edges are never ruler-straight

    pits, crumb_h = crumb_fields(w, h, 71, 1.35)  # cut vertically: cells stretched by the rise
    sponge_col = crumb_colour(pits, w, h, 71)
    cream_col = mix(rgb('#f8ecd9'), rgb('#fdf5ea'), fbm(w, h, 10, 10, 72, 3))
    frosting_col = mix(rgb('#f3e7d6'), rgb('#faf1e5'), fbm(w, h, 8, 8, 73, 3))

    colour = frosting_col.copy()
    height = 0.5 + 0.03 * (fbm(w, h, 40, 40, 74, 2) - 0.5)
    in_stack = (u < CAKE['radius'] + wobble) & (v < STACK_H + wobble)
    for i in range(3):
        bottom = i * (CAKE['layer'] + CAKE['cream'])
        band = in_stack & (v >= bottom + wobble) & (v < bottom + CAKE['layer'] + wobble)
        colour[band] = sponge_col[band]
        height[band] = 0.5 + 0.5 * (crumb_h[band] - 0.5)
        # the thin crust where the layer was baked against the tin
        crust_line = band & (v < bottom + 0.012 + wobble)
        colour[crust_line] = colour[crust_line] * 0.55 + rgb('#9a5d26') * 0.45
    for i in range(2):
        bottom = i * (CAKE['layer'] + CAKE['cream']) + CAKE['layer']
        band = in_stack & (v >= bottom + wobble) & (v < bottom + CAKE['cream'] + wobble)
        colour[band] = cream_col[band]
    side_crust = in_stack & (u > CAKE['radius'] - 0.012 + wobble)
    colour[side_crust] = colour[side_crust] * 0.5 + rgb('#a8672e') * 0.5
    save('inside-color.webp', colour, 90)
    save('inside-normal.webp', normal_map(height, 6.0, wrap=False), 92)
    save_height('inside-height.webp', height, 2.5, wrap=False)


if __name__ == '__main__':
    crumb()
    crust()
    cream()
    satin()
    inside()
