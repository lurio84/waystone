"""
Genera los iconos y el splash de Waystone con PIL — sin dependencias de diseño.

El motivo: una losa vertical (mojón) con el remate superior achaflanado a 45°,
un galón tallado apuntando arriba-derecha (dirección) y una muesca horizontal
(distancia). Piedra sobre pizarra; los cortes en ámbar.

Salidas (assets/images/):
  icon.png                      1024  icono base (iOS / genérico)
  android-icon-background.png    1024  fondo adaptativo (pizarra sólida)
  android-icon-foreground.png    1024  losa, dentro de la zona segura (~66%)
  android-icon-monochrome.png    1024  silueta blanca sobre transparente
  splash-icon.png                 512  losa sola, para el splash

Uso:  python scripts/gen-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

SLATE = (22, 27, 30, 255)      # #161B1E  fondo
STONE = (60, 72, 78, 255)      # cara de la piedra (subida de contraste sobre pizarra)
STONE_HI = (86, 100, 107, 255) # arista iluminada
AMBER = (217, 164, 65, 255)    # #D9A441  los cortes
MOSS = (125, 155, 78, 255)     # #7D9B4E


def waystone(size: int, *, fill=STONE, cut=AMBER, edge=STONE_HI, margin_frac=0.17):
    """Monolito: piedra vertical que se estrecha hacia arriba, con el remate
    achaflanado, una flecha tallada (dirección) y muescas (distancia).
    Devuelve RGBA transparente."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    m = size * margin_frac
    s = size - 2 * m
    cx = size / 2
    top, bot = m, m + s
    half_top = s * 0.30   # más estrecho arriba → se lee como piedra de pie
    half_bot = s * 0.42
    ch = s * 0.16         # chaflán del remate, esquina superior derecha

    slab = [
        (cx - half_top, top),
        (cx + half_top - ch, top),
        (cx + half_top, top + ch),
        (cx + half_bot, bot),
        (cx - half_bot, bot),
    ]
    d.polygon(slab, fill=fill)

    tw = max(3, size // 150)
    d.line([(cx - half_top, top), (cx + half_top - ch, top), (cx + half_top, top + ch)],
           fill=edge, width=tw)

    # Flecha tallada apuntando arriba-derecha — waymarker.
    aw = max(5, size // 64)
    ax, ay = cx - s * 0.16, top + s * 0.44          # cola
    bx, by = cx + s * 0.18, top + s * 0.14          # punta
    d.line([(ax, ay), (bx, by)], fill=cut, width=aw)
    head = s * 0.12
    d.line([(bx, by), (bx - head, by)], fill=cut, width=aw)
    d.line([(bx, by), (bx, by + head)], fill=cut, width=aw)

    # Tres muescas apiladas — distancia recorrida, como marcas en un mojón.
    for i in range(3):
        ny = top + s * (0.62 + i * 0.10)
        d.line([(cx - s * 0.20, ny), (cx + s * 0.20, ny)], fill=cut, width=aw)

    return img


def compose(bg_color, fg, size):
    img = Image.new("RGBA", (size, size), bg_color)
    img.alpha_composite(fg)
    return img.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Icono base y fondo adaptativo.
    compose(SLATE, waystone(1024, margin_frac=0.20), 1024).save(OUT / "icon.png")
    Image.new("RGB", (1024, 1024), SLATE[:3]).save(OUT / "android-icon-background.png")

    # Foreground adaptativo: la losa vive dentro de la zona segura (~66%).
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fg.alpha_composite(waystone(1024, margin_frac=0.30))
    fg.save(OUT / "android-icon-foreground.png")

    # Monocromo: silueta blanca (Android la tiñe).
    mono = waystone(1024, fill=(255, 255, 255, 255), cut=(255, 255, 255, 255),
                    edge=(255, 255, 255, 0), margin_frac=0.30)
    mono.save(OUT / "android-icon-monochrome.png")

    # Splash: losa sola sobre transparente, la pinta expo-splash-screen sobre #161B1E.
    waystone(512, margin_frac=0.12).save(OUT / "splash-icon.png")

    print("iconos escritos en", OUT)


if __name__ == "__main__":
    main()
