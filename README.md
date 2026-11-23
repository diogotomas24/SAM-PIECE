# SAM PIECE 3D

**Dirección:** https://sam-piece.vercel.app (los QR apuntan aquí: `https://sam-piece.vercel.app/#sp-xxxxxxxxxx`)

Web app privada para la colección de 54 cartas SAM PIECE: escanear el QR de cada carta desbloquea su figura 3D.

- **Sin base de datos:** el progreso se guarda en el propio teléfono (localStorage). Copia de seguridad desde *Perfil*.
- **Sin paso de compilación:** HTML, CSS y JS estáticos. Vercel lo publica tal cual (Framework: *Other*).
- **3D:** three.js desde jsDelivr; modelos `.glb` en `models/` (preferible comprimidos con Meshopt).
- **Instalable:** `manifest.webmanifest` + `sw.js` (funciona sin conexión).

## Rutas
| Ruta | Pantalla |
|---|---|
| `#coleccion` | Colección |
| `#carta-001` | Ficha |
| `#figura-001` | Visor 3D |
| `#escaner` | Escanear |
| `#perfil` | Progreso y copia de seguridad |
| `#sp-xxxxxxxxxx` | Enlace de un QR: desbloquea la carta |
| `#pruebas`, `#diagnostico`, `#grupo` | Ocultas, para pruebas |

## Cartas
`cards.json` contiene las 54 cartas. Cada código se guarda solo como hash SHA-256 (`sampiece:` + código), nunca en claro.
**Los códigos en claro no deben subirse a este repositorio**: todo lo que hay aquí se publica.

Al cambiar la app, sube `CACHE` en `sw.js` para que los móviles reciban la versión nueva.
