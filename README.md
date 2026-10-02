# 🚀 Espacio Crítico — Shooter 2D en HTML5 Canvas (v4 Director's Cut)

Proyecto de **Miguel León**. Nave 2D, asteroides, 6 naves-jefe, power-ups, Top-5 local, audio sintetizado y 100% responsive (PC + móvil).

![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange) ![CSS](https://img.shields.io/badge/CSS-Responsive-blue) ![JS](https://img.shields.io/badge/JS-Vanilla-yellow)

## ▶️ Jugar

1. Abre con Live Server en VS Code (recomendado) o doble clic en `index.html`.
2. Elige dificultad (Fácil / Normal / Difícil) y pulsa **▶ JUGAR AHORA** o **Enter**.

## 🎮 Controles reales

| Acción | PC | Móvil |
|---|---|---|
| Mover | `W A S D` / flechas | Arrastrar dedo (la nave sigue al dedo con offset) |
| Disparar | `Espacio` mantenido / Clic izquierdo mantenido | Automático al tocar |
| Auto-fuego PC | `F` (persiste en localStorage) | Siempre activo al tocar |
| Pausa | `P` / `Esc` / botón ⏸️ | Botón ⏸️ |
| Sonido | `M` / botón 🔊 (persiste) | Botón 🔊 |
| Confirmar | `Enter` | Tap |

> El ratón **no mueve la nave, solo dispara**. Es decisión de diseño: en PC el guiado por ratón se sentía impreciso; el movimiento es teclado + táctil XY.

## ✨ Features v4 Director's Cut - 100% vectorial, 0 dependencias JS

- **Arte procedural neón**: nave con cabina, alas, llama animada e inclinación; asteroides poligonales irregulares con cráteres; 6 jefes dibujados por código; power-ups con icono + halo. Solo `img/logo.png` se usa para el brand (no la borres).
- **Motor deltaTime**: misma velocidad a 60/120/144 Hz, un solo `requestAnimationFrame`, `hit-stop` al matar.
- **Niveles con meta**: Nivel 1 = 16 kills, Nivel 2 = 20, etc. (`12 + n*4`). Al completar la meta aparece la nave-jefe; al matarla: bonus + cura (o puntos si vida llena) + 2 powers.
- **6 jefes**: AVISPA, MANTIS, DREADNOUGHT, HYDRA, LEVIATÁN, OMEGA (+HP por ciclo). Cada uno con movimiento (strafe/perseguir/zig) y poder normal + poder fuerte telegrafiado.
- **Telegrafiado rojo**: columna / línea / anillo avisan 0.5s antes. **No siempre es “sal de ahí”**: lee el texto del poder (ej. MANTIS “quédate en el centro”, LEVIATÁN “sigue el hueco”, AVISPA “sigue la línea”).
- **Enemigos**: normal (1-2 HP), weaver (zigzag, desde ~20s), kamikaze (persigue leve, desde ~35s), tank (3 HP, desde ~50s).
- **Racha/combo**: +bonus por racha (hasta +30 por kill). Solo se pierde si te golpean, no si escapan.
- **Defensa justa**: invencibilidad 2s tras daño, 1s tras absorber con escudo (evita perder escudo+vida en la misma volea).
- **Power-ups** (cada ~11s + 6% al destruir, 12% si tienes 3 o menos vidas): Triple 25%, Rapid 15%, Escudo 25%, Vida 35% (+1, máx 5; si tienes 5 sale Rapid). **Piedad**: con 3 o menos vidas el temporizado sale Vida (máx 1 cada 30s).
- **HUD**: puntos, récord, NV + progreso, corazones (compacto `❤️×5` si >3), timers Triple/Rapid, combo desde x3, barra de jefe + nombre + poder actual.
- **Estadísticas finales**: nivel, tiempo, destruidos, precisión (aciertos/disparos por proyectil), racha máx, jefes. Top-5 local con puntos/nivel/dificultad.
- **Audio WebAudio**: láser throttled, explosión con buffer cacheado, powerup/daño/game-over/boss-warn, mute persistente.
- **Responsive + accesible**: `aspect-ratio` 4/3, táctil `touch-action:none`, botones 44px, `focus-visible`, `prefers-reduced-motion`, auto-pausa al ocultar pestaña, zoom permitido.
- **Rendimiento**: contador FPS en el footer (2 Hz, sin coste), fondo prerenderizado, HUD a 8 Hz, topes de entidades (12 enemigos / 70 balas / 120 partículas) y **modo eco automático** que quita sombras y brillos si los FPS caen.
- **Fin de partida**: estadísticas + Top-5 con botones **↻ Jugar otra vez** y **Menú** para volver al inicio.

## 📁 Estructura

```
juego de nave en html/
├── index.html (HUD + 3 pantallas: inicio/pausa/fin)
├── css/estilos.css
├── js/juego.js (sin dependencias)
├── img/logo.png (logo del brand, SÍ se usa)
├── instrucciones.txt (guía rápida v4)
└── README.md
```

## 👨‍💻 Autor

Miguel León — Portafolio 2026.
