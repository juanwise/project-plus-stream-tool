#!/usr/bin/env python3
"""Copies the Project Plus fighter art and selector icons from the wise-generator repository into this tool.

    python3 tools/importAssets.py <path to the wise-generator repository>

Writes assets/characters/<fighter>/<costume>.webp (empty margins trimmed), assets/icons/<fighter>/<costume>.webp and
assets/characters.json (fighter names, URL names and costume counts, read from ProjectMEnum.java).
Needs Pillow with WebP support.
"""
import json, re, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
enum = (src / "src/main/java/thumbnailgenerator/enums/games/ssbpm/ProjectMEnum.java").read_text(encoding="utf-8")
fighters = [{"name": n, "code": c, "costumes": int(q)}
            for n, c, q in re.findall(r'\("([^"]+)", "([^"]+)", -1, (\d+)\)', enum) if c != "random"]
out = Path(__file__).resolve().parent.parent / "assets"
# Rebuilt by hand from complete costume sheets (sheet order, regular costumes first): never overwritten from wise-generator.
HAND_BUILT = {"peach", "zelda", "toon_link", "captain_falcon", "roy"}


def convert(job):
    file, target = job
    img = Image.open(file).convert("RGBA")
    if "characters" in target.parts:        # trim the empty margins so every fighter sits the same way in the overlays
        box = img.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        if box:
            img = img.crop((max(box[0] - 2, 0), max(box[1] - 2, 0), min(box[2] + 2, img.width), min(box[3] + 2, img.height)))
    img.save(target, quality=90, method=4)


jobs = []
for f in fighters:
    if f["code"] in HAND_BUILT:
        f["costumes"] = len(list((out / "characters" / f["code"]).glob("*.webp")))
        continue
    for kind, base, size in (("characters", src / "assets/characters/ssbpm/artwork", None),
                             ("icons", src / "src/main/resources/icons/ssbpm", None)):
        dest = out / kind / f["code"]
        dest.mkdir(parents=True, exist_ok=True)
        count = 0
        for n in range(1, f["costumes"] + 1):
            file = base / f["code"] / f"{n}.png"
            if not file.exists():
                continue
            jobs.append((file, dest / f"{n}.webp"))
            count += 1
        if kind == "characters":
            f["costumes"] = count
with ProcessPoolExecutor() as pool:
    list(pool.map(convert, jobs, chunksize=8))
(out / "characters.json").write_text(json.dumps(fighters, indent=1) + "\n", encoding="utf-8")
print(len(fighters), "fighters,", sum(f["costumes"] for f in fighters), "costumes")
