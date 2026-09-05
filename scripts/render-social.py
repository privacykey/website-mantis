"""Render the social card with Pillow; optional FONT_REGULAR and FONT_BOLD paths."""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
regular = os.environ.get('FONT_REGULAR', '/System/Library/Fonts/Courier.ttc')
bold = os.environ.get('FONT_BOLD', regular)
image = Image.new('RGB', (1200, 630), '#0b0b12')
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((36, 36, 1164, 594), radius=8, outline='#444454', width=1)

def text(x, y, value, size, strong=False, color='#e8e8f2'):
    font = ImageFont.truetype(bold if strong else regular, size, index=1 if strong and bold == regular else 0)
    draw.text((x, y), value, font=font, fill=color)

text(72, 64, '[ mantis ]', 32, True)
text(72, 150, 'Plant a tripwire URL.', 57, True)
text(72, 230, 'Know when it is fetched.', 53, True)
draw.line((72, 332, 1128, 332), fill='#444454', width=2)
for x, title, description in [
    (72, '01  CREATE', 'Make a unique URL'),
    (429, '02  PLACE', 'Choose your canary'),
    (786, '03  TEST', 'Confirm the alert'),
]:
    text(x, 369, title, 25, True)
    text(x, 412, description, 20, color='#a0a0b4')
text(72, 523, 'Self-hosted or edge  /  Open source', 25, color='#a0a0b4')
image.save(root / 'assets/social-preview.png')
