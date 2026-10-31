"""Calca los iconos oficiales BBVA (JPEG dentro de los .pdf-zip) a SVG con potrace."""
import io, os, sys, zipfile, json
import numpy as np
from PIL import Image
import potrace

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
VB = 24.0
res = {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.pdf') or f.startswith(('BBVA_MANUAL', 'Plantilla')) or not zipfile.is_zipfile(os.path.join(src, f)):
        continue
    name = f[:-4]
    z = zipfile.ZipFile(os.path.join(src, f))
    imgs = [i for i in z.namelist() if i.lower().endswith(('.jpeg', '.jpg', '.png'))]
    if not imgs:
        continue
    im = Image.open(io.BytesIO(z.read(imgs[0]))).convert('L')
    w, h = im.size
    k = VB / max(w, h)
    bm = potrace.Bitmap(np.array(im) >= 128)
    plist = bm.trace(turdsize=30, alphamax=1.0, opticurve=True, opttolerance=0.3)
    P = lambda p: f"{p.x * k:.2f} {p.y * k:.2f}"
    parts = []
    for curve in plist:
        d = [f"M{P(curve.start_point)}"]
        for s in curve.segments:
            if s.is_corner:
                d.append(f"L{P(s.c)}L{P(s.end_point)}")
            else:
                d.append(f"C{P(s.c1)} {P(s.c2)} {P(s.end_point)}")
        parts.append(''.join(d) + 'Z')
    dpath = ''.join(parts)
    res[name] = dpath
    with open(os.path.join(out, name + '.svg'), 'w') as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#001391"><path fill-rule="evenodd" d="{dpath}"/></svg>\n')
json.dump(res, open(os.path.join(out, '..', 'iconos-bbva.json'), 'w'), separators=(',', ':'))
print(len(res), 'iconos;', sum(len(v) for v in res.values()) // 1024, 'KB de trazados')
