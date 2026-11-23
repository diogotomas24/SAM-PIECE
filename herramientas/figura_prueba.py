"""Genera una figura chibi de prueba (GLB sin compresión) a partir de primitivas.
Solo sirve para comprobar carga, peso y visor; no representa a ningún personaje."""
import json, struct, sys, math
import numpy as np

def sphere(r=1, seg=24, rings=16):
    v, n, idx = [], [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg + 1):
            ph = 2 * math.pi * j / seg
            x, y, z = math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)
            v.append((x * r, y * r, z * r)); n.append((x, y, z))
    for i in range(rings):
        for j in range(seg):
            a = i * (seg + 1) + j; b = a + seg + 1
            idx += [a, a + 1, b, b, a + 1, b + 1]
    return np.array(v, 'f4'), np.array(n, 'f4'), np.array(idx, 'u4')

def cylinder(r1=1, r2=1, h=1, seg=24, caps=True):
    v, n, idx = [], [], []
    slope = (r1 - r2) / h
    for k, (r, y) in enumerate([(r1, -h / 2), (r2, h / 2)]):
        for j in range(seg + 1):
            ph = 2 * math.pi * j / seg
            c, s = math.cos(ph), math.sin(ph)
            v.append((c * r, y, s * r))
            l = math.sqrt(1 + slope * slope); n.append((c / l, slope / l, s / l))
    for j in range(seg):
        a, b = j, j + seg + 1
        idx += [a, b, a + 1, a + 1, b, b + 1]
    if caps:
        for r, y, ny in [(r1, -h / 2, -1), (r2, h / 2, 1)]:
            base = len(v); v.append((0, y, 0)); n.append((0, ny, 0))
            for j in range(seg + 1):
                ph = 2 * math.pi * j / seg
                v.append((math.cos(ph) * r, y, math.sin(ph) * r)); n.append((0, ny, 0))
            for j in range(seg):
                if ny > 0: idx += [base, base + j + 2, base + j + 1]
                else: idx += [base, base + j + 1, base + j + 2]
    return np.array(v, 'f4'), np.array(n, 'f4'), np.array(idx, 'u4')

def box(sx, sy, sz):
    v, n, idx = [], [], []
    faces = [((1,0,0),(0,1,0),(0,0,1)),((-1,0,0),(0,1,0),(0,0,-1)),((0,1,0),(0,0,1),(1,0,0)),
             ((0,-1,0),(0,0,-1),(1,0,0)),((0,0,1),(1,0,0),(0,1,0)),((0,0,-1),(-1,0,0),(0,1,0))]
    for nn, u, w in faces:
        nn, u, w = map(np.array, (nn, u, w)); b = len(v)
        for su, sw in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            p = nn * 0.5 + u * 0.5 * su + w * 0.5 * sw
            v.append(p * (sx, sy, sz)); n.append(nn)
        idx += [b, b + 1, b + 2, b, b + 2, b + 3]
    vv = np.array(v, 'f4'); nn = np.array(n, 'f4'); ii = np.array(idx, 'u4')
    # asegurar orientación CCW hacia fuera
    tri = vv[ii.reshape(-1, 3)]
    cr = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    fn = nn[ii.reshape(-1, 3)[:, 0]]
    flip = (cr * fn).sum(1) < 0
    t = ii.reshape(-1, 3); t[flip] = t[flip][:, [0, 2, 1]]
    return vv, nn, t.reshape(-1)

def xform(mesh, s=(1,1,1), rot=(0,0,0), t=(0,0,0)):
    v, n, i = mesh
    rx, ry, rz = [math.radians(a) for a in rot]
    Rx = np.array([[1,0,0],[0,math.cos(rx),-math.sin(rx)],[0,math.sin(rx),math.cos(rx)]])
    Ry = np.array([[math.cos(ry),0,math.sin(ry)],[0,1,0],[-math.sin(ry),0,math.cos(ry)]])
    Rz = np.array([[math.cos(rz),-math.sin(rz),0],[math.sin(rz),math.cos(rz),0],[0,0,1]])
    R = Rz @ Ry @ Rx
    S = np.array(s)
    v2 = (v * S) @ R.T + np.array(t)
    n2 = (n / S) @ R.T; n2 /= np.linalg.norm(n2, axis=1, keepdims=True)
    return v2.astype('f4'), n2.astype('f4'), i

parts = []  # (nombre, malla, color, metal, rugosidad)
def add(name, mesh, color, metal=0.0, rough=0.6):
    parts.append((name, mesh, color, metal, rough))

SKIN = (1.0, 0.80, 0.66, 1); NAVY = (0.06, 0.10, 0.26, 1); GOLD = (0.95, 0.72, 0.25, 1)
HAIR = (0.13, 0.08, 0.06, 1); WHITE = (0.95, 0.95, 0.97, 1); BLACK = (0.03, 0.03, 0.05, 1)
RED = (0.75, 0.10, 0.12, 1); ORANGE = (0.93, 0.42, 0.10, 1)

# Piernas y zapatos
for sx in (-1, 1):
    add('pierna', xform(cylinder(0.13, 0.11, 0.62), t=(0.14 * sx, 0.42, 0)), NAVY)
    add('zapato', xform(box(0.2, 0.12, 0.32), t=(0.14 * sx, 0.07, 0.05)), WHITE, rough=0.4)
    add('suela', xform(box(0.21, 0.03, 0.33), t=(0.14 * sx, 0.015, 0.05)), RED)
# Torso (abrigo)
add('torso', xform(cylinder(0.27, 0.33, 0.62), t=(0, 1.02, 0)), NAVY, rough=0.5)
add('faldon', xform(cylinder(0.36, 0.29, 0.22, caps=False), t=(0, 0.66, 0)), NAVY, rough=0.5)
add('cinturon', xform(cylinder(0.295, 0.295, 0.07), t=(0, 0.76, 0)), GOLD, metal=0.8, rough=0.3)
add('hebilla', xform(box(0.1, 0.08, 0.03), t=(0, 0.76, 0.3)), GOLD, metal=0.9, rough=0.25)
add('camiseta', xform(box(0.2, 0.42, 0.05), t=(0, 1.08, 0.27), rot=(-6, 0, 0)), RED)
for sx in (-1, 1):
    add('solapa', xform(box(0.06, 0.5, 0.04), t=(0.12 * sx, 1.06, 0.29), rot=(-6, 0, 0)), GOLD, metal=0.7, rough=0.35)
    add('hombrera', xform(sphere(1), s=(0.15, 0.08, 0.13), t=(0.31 * sx, 1.31, 0)), GOLD, metal=0.8, rough=0.3)
# Brazos
add('brazo_izq', xform(cylinder(0.09, 0.075, 0.52), rot=(0, 0, -12), t=(-0.36, 1.07, 0)), NAVY)
add('mano_izq', xform(sphere(0.085), t=(-0.42, 0.78, 0)), SKIN)
add('brazo_der', xform(cylinder(0.09, 0.075, 0.5), rot=(-55, 0, 18), t=(0.38, 1.12, 0.17)), NAVY)
add('mano_der', xform(sphere(0.085), t=(0.45, 0.97, 0.38)), SKIN)
# Balón (accesorio de prueba)
add('balon', xform(sphere(0.16, 32, 20), t=(0.47, 1.18, 0.45)), ORANGE, rough=0.8)
for rot in [(0, 0, 0), (90, 0, 0), (0, 0, 90)]:
    add('linea_balon', xform(cylinder(0.163, 0.163, 0.012, 32, caps=False), rot=rot, t=(0.47, 1.18, 0.45)), BLACK)
# Cuello y cabeza (proporción chibi)
add('cuello', xform(cylinder(0.08, 0.08, 0.12), t=(0, 1.38, 0)), SKIN)
add('cabeza', xform(sphere(1, 32, 24), s=(0.34, 0.37, 0.33), t=(0, 1.68, 0)), SKIN, rough=0.7)
for sx in (-1, 1):
    add('ojo', xform(sphere(1), s=(0.055, 0.08, 0.02), t=(0.12 * sx, 1.68, 0.315)), BLACK, rough=0.2)
    add('brillo', xform(sphere(1), s=(0.018, 0.025, 0.01), t=(0.10 * sx + 0.015, 1.71, 0.335)), WHITE, rough=0.1)
    add('oreja', xform(sphere(1), s=(0.05, 0.08, 0.04), t=(0.335 * sx, 1.66, 0)), SKIN)
add('boca', xform(box(0.08, 0.015, 0.01), t=(0, 1.56, 0.322)), (0.45, 0.12, 0.12, 1))
# Pelo: casquete + mechones puntiagudos
add('pelo_base', xform(sphere(1, 32, 24), s=(0.36, 0.3, 0.35), t=(0, 1.82, -0.02)), HAIR, rough=0.5)
spikes = [(-0.22, 1.9, 0.2, 35, 0, 30), (0.0, 1.95, 0.24, 45, 0, 0), (0.22, 1.9, 0.2, 35, 0, -30),
          (-0.3, 1.85, -0.05, 0, 0, 60), (0.3, 1.85, -0.05, 0, 0, -60), (0, 2.02, -0.05, -10, 0, 0),
          (-0.18, 1.95, -0.22, -40, 0, 30), (0.18, 1.95, -0.22, -40, 0, -30), (0, 1.88, -0.32, -70, 0, 0)]
for x, y, z, rx, ry, rz in spikes:
    add('mechon', xform(cylinder(0.11, 0.0, 0.32, 12), rot=(rx, ry, rz), t=(x, y, z)), HAIR, rough=0.5)
# Pañuelo con estrella dorada (detalle propio SAM PIECE)
add('panuelo', xform(cylinder(0.355, 0.355, 0.07, 32, caps=False), t=(0, 1.8, 0)), RED)
add('emblema', xform(sphere(1), s=(0.05, 0.05, 0.015), t=(0, 1.8, 0.355)), GOLD, metal=0.9, rough=0.25)

# --- Escritura GLB ---
bin_chunks = bytearray(); bufferViews = []; accessors = []; meshes = []; nodes = []; materials = []
mat_index = {}
def push(arr, target):
    global bin_chunks
    off = len(bin_chunks); data = arr.tobytes()
    bin_chunks += data
    while len(bin_chunks) % 4: bin_chunks += b'\0'
    bufferViews.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
    return len(bufferViews) - 1

for name, (v, n, i), col, metal, rough in parts:
    key = (col, metal, rough)
    if key not in mat_index:
        materials.append({'name': f'mat{len(materials)}', 'pbrMetallicRoughness': {
            'baseColorFactor': list(col), 'metallicFactor': metal, 'roughnessFactor': rough}})
        mat_index[key] = len(materials) - 1
    bvp = push(v, 34962); accessors.append({'bufferView': bvp, 'componentType': 5126, 'count': len(v), 'type': 'VEC3',
                                           'min': v.min(0).tolist(), 'max': v.max(0).tolist()})
    ap = len(accessors) - 1
    bvn = push(n, 34962); accessors.append({'bufferView': bvn, 'componentType': 5126, 'count': len(n), 'type': 'VEC3'})
    an = len(accessors) - 1
    i16 = i.astype('u2') if len(v) < 65535 else i
    bvi = push(i16, 34963); accessors.append({'bufferView': bvi, 'componentType': 5123 if i16.dtype == np.uint16 else 5125,
                                             'count': len(i16), 'type': 'SCALAR'})
    ai = len(accessors) - 1
    meshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': ap, 'NORMAL': an}, 'indices': ai,
                                                 'material': mat_index[key]}]})
    nodes.append({'name': name, 'mesh': len(meshes) - 1})

gltf = {'asset': {'version': '2.0', 'generator': 'SAM PIECE prueba'}, 'scene': 0,
        'scenes': [{'nodes': [len(nodes)]}],
        'nodes': nodes + [{'name': 'FiguraPrueba', 'children': list(range(len(nodes)))}],
        'meshes': meshes, 'materials': materials, 'accessors': accessors, 'bufferViews': bufferViews,
        'buffers': [{'byteLength': len(bin_chunks)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = sys.argv[1]
with open(out, 'wb') as f:
    total = 12 + 8 + len(js) + 8 + len(bin_chunks)
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(bin_chunks), 0x004E4942)); f.write(bin_chunks)
tris = sum(len(p[1][2]) // 3 for p in parts)
print(out, total, 'bytes', tris, 'triángulos', len(parts), 'piezas')
