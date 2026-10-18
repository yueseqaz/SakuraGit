"""Regenerate the SakuraGit application icon (requires Pillow)."""

from pathlib import Path

from PIL import Image, ImageDraw

size = 2048
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((96, 96, 1952, 1952), radius=420, fill="#537b99")
draw.rounded_rectangle((125, 125, 1923, 1923), radius=395, outline="#7b9db6", width=5)
cream = "#eef4f8"
draw.line((710, 548, 710, 1500), fill=cream, width=104)
points = []
for i in range(101):
    t = i / 100
    u = 1 - t
    x = u**3 * 710 + 3 * u**2 * t * 710 + 3 * u * t**2 * 1360 + t**3 * 1360
    y = u**3 * 1215 + 3 * u**2 * t * 765 + 3 * u * t**2 * 1110 + t**3 * 548
    points.append((x, y))
draw.line(points, fill=cream, width=104, joint="curve")
for x, y in [(710, 548), (710, 1500), (1360, 548)]:
    draw.ellipse((x - 155, y - 155, x + 155, y + 155), fill=cream)
output = Path(__file__).resolve().parents[1] / "resources" / "icon.png"
output.parent.mkdir(exist_ok=True)
image.resize((1024, 1024), Image.Resampling.LANCZOS).save(output)
print(output)
