"""Generate character-specific Tidecall action icons from downloaded skill art.

The source collection stays untouched. Generated assets are written both to the
local material folder for inspection and to public/ for the app runtime.
"""

from __future__ import annotations

import argparse
import io
import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageChops, ImageDraw, ImageOps


SIZE = 313
SCALE = 2
INNER_RADIUS = 137
OUTER_RADIUS = 148
CENTER = (SIZE - 1) / 2

ACTION_SOURCES = {
    "basic_attack": "常态攻击",
    "heavy_attack": "常态攻击",
    "skill": "共鸣技能",
    "skill_hold": "共鸣技能",
    "echo": "共鸣回路",
    "echo_hold": "共鸣回路",
    "liberation": "共鸣解放",
    "liberation_hold": "共鸣解放",
    "intro": "变奏技能",
    "outro": "延奏技能",
}
HOLD_ACTIONS = {"heavy_attack", "skill_hold", "echo_hold", "liberation_hold"}
LIBERATION_ACTIONS = {"liberation", "liberation_hold"}
ELEMENT_RING_COLORS = {
    "导电": "#3f5fd0",
    "湮灭": "#cf65c9",
    "冷凝": "#52aee8",
    "气动": "#65c58b",
    "风蚀": "#65c58b",
    "衍射": "#e2c84b",
    "热熔": "#ed8a46",
}

# Values come from the character list API. Keeping this small local snapshot
# makes packaging deterministic and avoids a network request when building.
CHARACTER_ELEMENTS = {
    "冷凝": "散华,白芷,凌阳,折枝,釉瑚,珂莱塔,绯雪,洛瑟菈,穗穗",
    "热熔": "炽霞,安可,莫特斐,长离,布兰特,露帕,嘉贝莉娜,莫宁,爱弥斯,达妮娅,景燃",
    "导电": "卡卡罗,吟霖,渊武,相里要,奥古斯塔,卜灵,丽贝卡,漂泊者·导电,灯灯",
    "衍射": "今汐,维里奈,守岸人,菲比,赞妮,琳奈,陆·赫斯,露西,漂泊者·衍射",
    "气动": "秧秧,秋水,忌炎,鉴心,夏空,卡提希娅,尤诺,仇远,西格莉卡,清宵,漂泊者·气动",
    "湮灭": "千咲,桃祈,丹瑾,椿,洛可可,坎特蕾拉,弗洛洛,秧秧·玄翎,漂泊者·湮灭",
}
CHARACTER_ELEMENT_BY_NAME = {
    character: element
    for element, names in CHARACTER_ELEMENTS.items()
    for character in names.split(",")
}


def character_element(character: str) -> str | None:
    element = CHARACTER_ELEMENT_BY_NAME.get(character)
    if element:
        return element
    # The source folders retain gender, while the API character name does not.
    return next(
        (value for name, value in CHARACTER_ELEMENT_BY_NAME.items() if character.startswith(f"{name}（")),
        None,
    )


def scaled(value: float) -> int:
    return round(value * SCALE)


def ellipse_box(radius: float) -> tuple[int, int, int, int]:
    return (
        scaled(CENTER - radius),
        scaled(CENTER - radius),
        scaled(CENTER + radius),
        scaled(CENTER + radius),
    )


@lru_cache(maxsize=16)
def make_frame(hold: bool, ring_color: str) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(canvas)
    outer = ring_color if ring_color else "#ffffff"
    inner = (0, 153, 255, 178) if hold else (0, 0, 0, 178)
    draw.ellipse(ellipse_box(OUTER_RADIUS), fill=outer)
    draw.ellipse(ellipse_box(INNER_RADIUS), fill=inner)

    if hold:
        # The white backing keeps the orange hold marker readable over the ring.
        draw.polygon(
            [(scaled(106), 0), (scaled(207), 0), (scaled(CENTER), scaled(66))],
            fill=(255, 255, 255, 255),
        )
        draw.polygon(
            [(scaled(122), scaled(12)), (scaled(191), scaled(12)), (scaled(CENTER), scaled(54))],
            fill=(255, 95, 0, 255),
        )
    return canvas


def brighten_for_hold(icon: Image.Image) -> Image.Image:
    alpha = icon.getchannel("A")
    gray = ImageOps.grayscale(icon).point(lambda value: max(190, value))
    return Image.merge("RGBA", (gray, gray, gray, alpha))


@lru_cache(maxsize=256)
def prepare_icon(source: Path, hold: bool) -> Image.Image:
    icon = Image.open(source).convert("RGBA")
    alpha = icon.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"empty source icon: {source}")
    icon = icon.crop(bbox)
    if hold:
        icon = brighten_for_hold(icon)

    max_size = 222 if hold else 232
    scale_factor = min(max_size / icon.width, max_size / icon.height)
    icon = icon.resize(
        (max(1, round(icon.width * scale_factor * SCALE)), max(1, round(icon.height * scale_factor * SCALE))),
        Image.Resampling.LANCZOS,
    )
    return icon


def compose_icon(source: Path, action: str, element: str | None) -> Image.Image:
    hold = action in HOLD_ACTIONS
    ring_color = ELEMENT_RING_COLORS.get(element, "#ffffff") if action in LIBERATION_ACTIONS else "#ffffff"
    canvas = make_frame(hold, ring_color).copy()
    icon = prepare_icon(source, hold).copy()
    x = round((SIZE * SCALE - icon.width) / 2)
    y_center = CENTER + (11 if hold else 0)
    y = round(y_center * SCALE - icon.height / 2)

    # Keep the source art inside the circular plate, including icons with wide corners.
    clip = Image.new("L", icon.size, 0)
    clip_draw = ImageDraw.Draw(clip)
    clip_center_x = CENTER * SCALE - x
    clip_center_y = y_center * SCALE - y
    clip_radius = 126 * SCALE
    clip_draw.ellipse(
        (
            round(clip_center_x - clip_radius),
            round(clip_center_y - clip_radius),
            round(clip_center_x + clip_radius),
            round(clip_center_y + clip_radius),
        ),
        fill=255,
    )
    icon.putalpha(ImageChops.multiply(icon.getchannel("A"), clip))
    canvas.alpha_composite(icon, (x, y))
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def discover_sources(source_root: Path) -> dict[str, dict[str, Path]]:
    result: dict[str, dict[str, Path]] = {}
    for source in sorted(source_root.glob("*.webp"), key=lambda item: item.name):
        if "-" not in source.stem:
            continue
        character, skill = source.stem.rsplit("-", 1)
        result.setdefault(character, {})[skill] = source
    return result


def write_manifest(output_root: Path, characters: list[str]) -> None:
    base_url = "/combo-assets/button-icons/tide/characters"
    payload = {
        "version": 1,
        "actions": ACTION_SOURCES,
        "characters": [
            {
                "name": character,
                "element": character_element(character),
                "path": f"{base_url}/{quote(character, safe='')}",
                "icons": {
                    action: f"{base_url}/{quote(character, safe='')}/{action}.webp"
                    for action in ACTION_SOURCES
                },
            }
            for character in characters
        ],
    }
    (output_root / "index.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def generate(source_root: Path, output_roots: list[Path]) -> tuple[int, list[str], int]:
    sources = discover_sources(source_root)
    generated = 0
    generated_characters = 0
    characters: list[str] = []
    missing: list[str] = []
    for character, skills in sources.items():
        if any(skill not in skills for skill in set(ACTION_SOURCES.values())):
            missing.append(character)
            continue
        characters.append(character)
        generated_characters += 1
        for output_root in output_roots:
            (output_root / character).mkdir(parents=True, exist_ok=True)
        for action, source_skill in ACTION_SOURCES.items():
            image = compose_icon(skills[source_skill], action, character_element(character))
            encoded = io.BytesIO()
            # Method 4 keeps the 313px overlays crisp while making a full
            # character set practical to regenerate during development.
            image.save(encoded, "WEBP", quality=95, method=4)
            payload = encoded.getvalue()
            for output_root in output_roots:
                (output_root / character / f"{action}.webp").write_bytes(payload)
            generated += 1
    for output_root in output_roots:
        output_root.mkdir(parents=True, exist_ok=True)
        write_manifest(output_root, characters)
    return generated, missing, generated_characters


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("素材/角色/图标"))
    parser.add_argument(
        "--runtime-output",
        type=Path,
        default=Path("public/combo-assets/button-icons/tide/characters"),
    )
    parser.add_argument(
        "--material-output",
        type=Path,
        default=Path("素材/角色/图标/潮声"),
    )
    args = parser.parse_args()
    output_roots = list(dict.fromkeys([args.runtime_output, args.material_output]))
    generated, missing, generated_characters = generate(args.source, output_roots)
    print(f"generated {generated} icons for {generated_characters} characters")
    if missing:
        print("skipped incomplete characters: " + ", ".join(missing))


if __name__ == "__main__":
    main()
