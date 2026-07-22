from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / "_production/poster-source-final.webp").convert("RGB")

# The platform can retain a portrait canvas even for a square request. Use a
# centered square crop that keeps the upper title space and the whole stroke.
w, h = source.size
side = min(w, h)
left = (w - side) // 2
top = max(0, min((h - side) // 3, h - side))
square = source.crop((left, top, left + side, top + side)).resize(
    (1024, 1024), Image.Resampling.LANCZOS
)
square = ImageEnhance.Contrast(square).enhance(1.035)
square = ImageEnhance.Color(square).enhance(1.06)
draw = ImageDraw.Draw(square)

label_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Black.ttf", 86)

draw.rectangle((58, 48, 62, 202), fill=(82, 62, 255))
draw.text((82, 48), "04 / LIGHT STUDY", font=label_font, fill=(51, 51, 59))
draw.text((78, 77), "LIGHTSTROKE", font=title_font, fill=(16, 16, 20))

poster = ROOT / "public/poster.png"
thumb = ROOT / "_production/poster-thumb.png"
square.quantize(
    colors=192,
    method=Image.Quantize.MEDIANCUT,
    dither=Image.Dither.FLOYDSTEINBERG,
).save(poster, optimize=True)
square.resize((160, 160), Image.Resampling.LANCZOS).save(thumb, optimize=True)
