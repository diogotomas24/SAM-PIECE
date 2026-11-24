# Recursos gráficos de SAM PIECE 3D

Coloca aquí los gráficos definitivos (generados con ChatGPT). Formato recomendado: **WebP**, ancho máximo 900 px (fondos a pantalla completa: 1080 px).
Las rutas que usa la app están en `ASSETS` e `ISLAS` al principio de la sección «recursos gráficos» de `app.js`.

| Carpeta | Contenido | Nombres esperados |
|---|---|---|
| `cinematicas/` | Ilustraciones de la intro | `intro.webp` (en uso) |
| `mapa/` | Mapa de las 12 islas | `mapa.webp` (en uso) |
| `fondos/` | Fondos y tarjetas | `barco-inicio.webp` (en uso) |
| `islas/` | Islas sueltas, fondo transparente (PNG/WebP con alfa) | `isla-01.webp` … `isla-12.webp` |
| `iconos/` | Iconos dorados (SVG preferible) | `inicio.svg`, `album.svg`, `escanear.svg`, `tripulacion.svg`, `capitan.svg`, `mapa.svg`, `museo.svg`, `diario.svg` |
| `medallas/` | Medallas de logros | `primera.webp`, `cinco.webp`, … (mismo id que el logro) |
| `marcos/` | Marcos por rareza y reverso | `reverso.webp`, `marco-sr.webp`, … |
| `texturas/` | Texturas de pergamino, madera, mar | libre |
| `escenarios/` | Fondo del museo 3D | `museo.webp` |
| `wanted/` | Carteles WANTED por amigo | `wanted-<nombre>.webp` |
| `certificados/` | Certificado final 001/001 | `certificado.webp` |

Mapa: la posición de cada isla (para las zonas pulsables) está en `ISLAS` como fracción del ancho/alto de `mapa.webp`. Si cambia el mapa, hay que ajustar esas coordenadas.
