# Контактный лист из стоп-кадров: python3 scripts/sheet.py Comp out.png 1 2.5 4 ...
import sys
from PIL import Image
comp, out, secs = sys.argv[1], sys.argv[2], sys.argv[3:]
ims = [Image.open(f"out/stills/{comp}-{s}.png") for s in secs]
w, h = ims[0].size
tw = 270 if h > w else 480
th = int(h * tw / w)
cols = min(len(ims), 8 if h > w else 4)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, th * rows), "black")
for i, im in enumerate(ims):
    sheet.paste(im.convert("RGB").resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
