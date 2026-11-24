"""Añade una ilustración a cards.json: recorta las esquinas de fondo y genera WebP grande y miniatura.
Uso: python3 herramientas/anadir_carta.py <imagen> <num> <nombre> <rareza> [personaje ...]"""
import json, sys
from PIL import Image, ImageDraw

def radio_esquina(im):
    c = im.getpixel((0, 0))
    for k in range(200):
        p = im.getpixel((k, k))
        if sum(abs(p[i] - c[i]) for i in range(3)) > 60:
            return k
    return 0

def procesar(src, num):
    im = Image.open(src).convert('RGB'); W, H = im.size
    r = int(radio_esquina(im) / (1 - 0.7071)) + 2
    m = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), radius=r * 4, fill=255)
    im.putalpha(m.resize((W, H), Image.LANCZOS))
    for w, name, q in [(900, num, 84), (360, num + '-mini', 80)]:
        im.resize((w, round(H * w / W)), Image.LANCZOS).save(f'images/cartas/{name}.webp', 'WEBP', quality=q, method=6)
    return r

if __name__ == '__main__':
    src, num, nombre, rareza, *pers = sys.argv[1:]
    num = num.zfill(3)
    r = procesar(src, num)
    d = json.load(open('cards.json'))
    c = next(x for x in d['cartas'] if x['num'] == num)
    c.update({'nombre': nombre, 'rareza': rareza, 'personajes': pers or [nombre],
              'imagen': f'images/cartas/{num}.webp', 'miniatura': f'images/cartas/{num}-mini.webp'})
    json.dump(d, open('cards.json', 'w'), ensure_ascii=False, indent=1)
    print(num, nombre, rareza, 'radio', r)
