#!/usr/bin/env python3
"""Build ProjectNote icon assets from the attached character artwork.

The full illustration is kept (face is not cropped). A rounded-square mask
makes the mark readable at 16px without cutting off the character.
"""

import base64
import io
import os
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE_CANDIDATES = [
    ROOT / "qt" / "resources" / "app-icon-source.png",
    Path("/home/ubuntu/.cursor/projects/workspace/uploads/projectnote-app-icon_9097.png"),
    Path("/workspace/projectnote-app-icon.png"),
]
RES = ROOT / "qt" / "resources"
PACK = ROOT / "qt" / "packaging"


def load_source() -> Image.Image:
    for path in SOURCE_CANDIDATES:
        if path.exists():
            im = Image.open(path).convert("RGBA")
            RES.mkdir(parents=True, exist_ok=True)
            if path.resolve() != (RES / "app-icon-source.png").resolve():
                shutil.copyfile(path, RES / "app-icon-source.png")
            return im
    raise SystemExit("character artwork not found")


def rounded_mask(size: int, radius_ratio: float = 0.22) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = max(2, int(round(size * radius_ratio)))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def fit_square(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def compose(src: Image.Image, size: int, mask: Image.Image, bg=(255, 255, 255, 255)) -> Image.Image:
    art = fit_square(src, size)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(art, (0, 0), art)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(canvas, (0, 0))
    out.putalpha(mask)
    return out


def app_icon(src: Image.Image, size: int) -> Image.Image:
    # Solid light fill inside the rounded square so the silver hair stays
    # visible on light taskbars. The whole character is scaled in, not cropped.
    return compose(src, size, rounded_mask(size), (247, 251, 255, 255))


def round_icon(src: Image.Image, size: int) -> Image.Image:
    return compose(src, size, circle_mask(size), (247, 251, 255, 255))


def foreground(src: Image.Image, size: int) -> Image.Image:
    # Adaptive-icon foreground: keep the face inside the center safe zone.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(round(size * 0.78))
    art = fit_square(src, inner)
    offset = (size - inner) // 2
    canvas.paste(art, (offset, offset), art)
    return canvas


def splash(src: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (247, 251, 255, 255))
    side = int(min(width, height) * 0.72)
    art = fit_square(src, side)
    canvas.paste(art, ((width - side) // 2, (height - side) // 2), art)
    return canvas


def save_ico(path: Path, images: list[Image.Image]) -> None:
    # Pillow often writes a single frame. ImageMagick keeps every size.
    ordered = sorted(images, key=lambda im: im.width)
    tmp = path.parent / f".{path.stem}-ico"
    tmp.mkdir(exist_ok=True)
    paths = []
    for im in ordered:
        frame = tmp / f"{im.width}.png"
        im.save(frame)
        paths.append(frame)
    if os.system("convert " + " ".join(str(p) for p in paths) + " " + str(path)) != 0:
        ordered[-1].save(
            path,
            format="ICO",
            sizes=[(im.width, im.height) for im in ordered],
            append_images=ordered[:-1],
        )
    shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    src = load_source()
    RES.mkdir(parents=True, exist_ok=True)
    PACK.mkdir(parents=True, exist_ok=True)
    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    icons = {size: app_icon(src, size) for size in sizes}
    for size, im in icons.items():
        im.save(RES / f"icon-{size}.png")

    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_images = [icons[s] for s in ico_sizes]
    for dest in [
        RES / "projectnote.ico",
        PACK / "projectnote.ico",
        ROOT / "icon.ico",
        ROOT / "build" / "icon.ico",
        ROOT / "electron" / "icon.ico",
        ROOT / "public" / "favicon.ico",
    ]:
        dest.parent.mkdir(parents=True, exist_ok=True)
        save_ico(dest, ico_images)

    png512 = icons[512]
    png256 = icons[256]
    for dest in [
        RES / "icon.png",
        ROOT / "icon.png",
        ROOT / "build" / "icon.png",
        ROOT / "electron" / "icon.png",
        ROOT / "public" / "icon.png",
    ]:
        dest.parent.mkdir(parents=True, exist_ok=True)
        png512.save(dest)

    png256.save(RES / "icon-256.png")
    png512.save(RES / "icon-512.png")

    # macOS .icns via png2icns (expects the classic size set).
    icns_dir = RES / "icns-src"
    icns_dir.mkdir(parents=True, exist_ok=True)
    icns_map = {
        "icon_16x16.png": icons[16],
        "icon_32x32.png": icons[32],
        "icon_128x128.png": icons[128],
        "icon_256x256.png": icons[256],
        "icon_512x512.png": icons[512],
    }
    for name, im in icns_map.items():
        im.save(icns_dir / name)
    icns_path = PACK / "projectnote.icns"
    os.system(
        "png2icns "
        + " ".join(
            [
                str(icns_path),
                str(icns_dir / "icon_16x16.png"),
                str(icns_dir / "icon_32x32.png"),
                str(icns_dir / "icon_128x128.png"),
                str(icns_dir / "icon_256x256.png"),
                str(icns_dir / "icon_512x512.png"),
            ]
        )
    )
    if icns_path.exists():
        shutil.copyfile(icns_path, RES / "projectnote.icns")

    buf = io.BytesIO()
    icons[256].save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <image width="256" height="256" href="data:image/png;base64,{b64}"/>
</svg>
'''
    (ROOT / "public" / "icon.svg").write_text(svg, encoding="utf-8")

    launcher = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    foreground_size = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    android_res = ROOT / "android" / "app" / "src" / "main" / "res"
    for folder, size in launcher.items():
        dest_dir = android_res / folder
        if not dest_dir.exists():
            continue
        app_icon(src, size).save(dest_dir / "ic_launcher.png")
        round_icon(src, size).save(dest_dir / "ic_launcher_round.png")
        foreground(src, foreground_size[folder]).save(dest_dir / "ic_launcher_foreground.png")

    splashes = list((android_res).rglob("splash.png"))
    for splash_path in splashes:
        with Image.open(splash_path) as existing:
            w, h = existing.size
        splash(src, w, h).save(splash_path)

    print("icons written")
    for size in ico_sizes:
        print(f"  {size}px corner alpha", icons[size].getpixel((0, 0))[3], "center", icons[size].getpixel((size // 2, size // 2))[:3])


if __name__ == "__main__":
    main()
