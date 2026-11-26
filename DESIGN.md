---

name: Garmin Connect Stats
description: Panel personal de salud y rendimiento con métricas transparentes frente a tu propio rango
colors:
background: "oklch(1 0 0)"
foreground: "oklch(0.145 0 0)"
card: "oklch(1 0 0)"
primary: "oklch(0.205 0 0)"
primary-foreground: "oklch(0.985 0 0)"
muted: "oklch(0.97 0 0)"
muted-foreground: "oklch(0.556 0 0)"
border: "oklch(0.922 0 0)"
ring: "oklch(0.708 0 0)"
destructive: "oklch(0.577 0.245 27.325)"
background-dark: "oklch(0.145 0 0)"
foreground-dark: "oklch(0.985 0 0)"
card-dark: "oklch(0.205 0 0)"
muted-dark: "oklch(0.269 0 0)"
muted-foreground-dark: "oklch(0.708 0 0)"
border-dark: "oklch(1 0 0 / 10%)"
status-ok: "oklch(0.723 0.219 149.579)"
status-warn: "oklch(0.828 0.189 84.429)"
status-alert: "oklch(0.637 0.237 25.331)"
viz-blue: "#2a78d6"
viz-orange: "#eb6834"
viz-aqua: "#1baf7a"
viz-yellow: "#eda100"
viz-band: "#86b6ef"
typography:
display:
fontFamily: "Orbitron, Geist Mono Variable, sans-serif"
fontSize: "1.9rem"
fontWeight: 900
letterSpacing: "0.04em"
headline:
fontFamily: "Orbitron, Geist Mono Variable, sans-serif"
fontSize: "0.95em"
fontWeight: 700
letterSpacing: "0.06em"
title:
fontFamily: "Geist Mono Variable, ui-monospace, monospace"
fontSize: "1rem"
fontWeight: 600
body:
fontFamily: "Geist Mono Variable, ui-monospace, monospace"
fontSize: "0.875rem"
fontWeight: 400
lineHeight: 1.43
label:
fontFamily: "Geist Mono Variable, ui-monospace, monospace"
fontSize: "0.75rem"
fontWeight: 500
numeric:
fontFamily: "VT323, ui-monospace, monospace"
fontSize: "2.4rem"
fontWeight: 400
lineHeight: 1
letterSpacing: "0.02em"
rounded:
none: "0px"
spacing:
xs: "4px"
sm: "8px"
md: "16px"
card: "20px"
section: "32px"
components:
button-primary:
backgroundColor: "{colors.primary}"
textColor: "{colors.primary-foreground}"
rounded: "{rounded.none}"
padding: "8px 12px"
card:
backgroundColor: "{colors.card}"
textColor: "{colors.foreground}"
rounded: "{rounded.none}"
padding: "{spacing.card}"
tabs:
backgroundColor: "{colors.muted}"
textColor: "{colors.muted-foreground}"
rounded: "{rounded.none}"
height: "36px"
tab-active:
backgroundColor: "{colors.background}"
textColor: "{colors.foreground}"
nav-link:
textColor: "{colors.muted-foreground}"
rounded: "{rounded.none}"
padding: "6px 12px"
nav-link-active:
backgroundColor: "{colors.muted}"
textColor: "{colors.foreground}"
---

# Design System: Garmin Connect Stats

## Overview

**Creative North Star: "El cuaderno de laboratorio"**

Un cuaderno de laboratorio no adorna: anota la medida, la fórmula y el margen de error, y deja que el dato hable. Este panel trabaja igual. La base es la escala neutra de shadcn/ui (blancos, grises y casi negros sin tinte), la letra es monoespaciada como la de un instrumento y el único color con significado es el del estado: verde, ámbar o rojo, siempre acompañado de texto. Las gráficas usan su propia paleta de cuatro tonos, validada en claro y en oscuro.

Sobre esa sobriedad hay un guiño de hardware ochentero contenido: títulos en Orbitron en mayúsculas, cifras grandes en una pantalla de LED (VT323), esquinas rectas, sombras duras desplazadas y, al fondo, una rejilla en perspectiva en el gris del borde. En oscuro se suman unas líneas de barrido de monitor CRT muy tenues. Nada de neones: el guiño vive en la forma y la tipografía, nunca en el color.

El carácter es **preciso y tranquilo**. La densidad es alta pero ordenada: muchas cifras por pantalla, cada una con su etiqueta, su comparación y una línea que dice cuánta confianza merece.

**Key Characteristics:**

- Escala neutra sin tinte; el color se reserva para el estado y las gráficas.
- Todo el texto en monoespaciada (Geist Mono); títulos en Orbitron mayúsculas; cifras grandes en LED (VT323).
- Esquinas rectas (0 px) y sombra dura de 4 px en las tarjetas.
- Modo claro y oscuro con el mismo peso; el oscuro tiene sus propios pasos, no es el claro invertido.
- Pensado para dos escenas: el vistazo matinal en el móvil y el análisis con calma en escritorio.

## Colors

Escala neutra de shadcn/ui ("new-york", base neutral) en OKLCH, más tres tonos de estado y una paleta de gráficas de cuatro series.

### Primary

- **Tinta de laboratorio** (`primary`): casi negro en claro, casi blanco en oscuro. Botones principales, enlace de saltar al contenido y `accent-color` de los controles nativos.

### Neutral

- **Papel** (`background`, `card`): blanco puro en claro. En oscuro, el fondo es un casi negro y la tarjeta un escalón más claro, para que la tarjeta se lea como superficie sin sombra difusa.
- **Gris de margen** (`muted`, `muted-dark`): fondo de los grupos de pestañas, de las cabeceras de tabla y del elemento activo del menú.
- **Grafito** (`muted-foreground`): etiquetas, subtítulos, unidades y textos de confianza ("orientativo").
- **Línea de cuadrícula** (`border`): bordes, separadores de tabla, sombra dura de las tarjetas y rejilla de fondo. En oscuro es blanco al 10 %.
- **Rojo de error** (`destructive`): solo errores de la aplicación, no estados de salud.

### Status

Los tonos de Tailwind 500/400 se usan como borde izquierdo de 4 px de las tarjetas de estado y como punto de color en las listas de señales.

- **Verde dentro de rango** (`status-ok`): señal normal, forma fresca, neutra u óptima.
- **Ámbar atención** (`status-warn`): fuera de lo habitual, transición, carga baja.
- **Rojo alerta** (`status-alert`): mal estado, riesgo, alerta alta.
- Sin datos o calibrando: borde en grafito (`muted-foreground`).

Las variaciones de las cifras usan `green-700`/`red-700` en claro y `green-400`/`red-400` en oscuro, para que el texto tenga contraste suficiente.

### Data Visualization

Tokens `--viz-*` en `global.css`, con valores propios para oscuro (`#3987e5`, `#d95926`, `#199e70`, `#c98500`, banda `#1c5cab`).

- **Azul** (`viz-blue`): serie principal (forma física, media de 7 días).
- **Naranja** (`viz-orange`): serie secundaria o de contraste (fatiga).
- **Aqua** (`viz-aqua`): tercera serie (forma).
- **Amarillo** (`viz-yellow`): cuarta serie, la última permitida.
- **Banda** (`viz-band`): rango normal personal (rangeArea), siempre con leyenda.

### Named Rules

**La regla del color que significa.** El color solo aparece para decir algo: estado (verde/ámbar/rojo) o serie de una gráfica. Ningún elemento lleva color por decoración.

**La regla del texto primero.** Ningún estado se transmite solo con color: siempre hay una palabra ("Dentro de tu rango", "Carga baja") o una flecha con texto.

**La regla de las cuatro series.** Una gráfica tiene como mucho cuatro series de color; si hacen falta más, se divide en gráficas sincronizadas.

## Typography

**Display Font:** Orbitron 700/900 (con Geist Mono de respaldo)
**Body Font:** Geist Mono Variable (con `ui-monospace`)
**Numeric Font:** VT323 (con `ui-monospace`)

**Character:** Geist Mono da a todo el panel la voz de un instrumento de medida, alineando cifras sin esfuerzo. Orbitron pone la etiqueta de hardware en los títulos y VT323 convierte las cifras protagonistas en una pantalla de LED.

### Hierarchy

Cada papel es una clase de `global.css` (`@layer components`). Usa la clase del papel, no tamaños de
Tailwind (`text-2xl`, `text-3xl`…): el papel no puede depender de qué utilidad lleve cada página.

- **Display** (`.type-display`; Orbitron 900, 1.9rem y 1.5rem por debajo de 640 px, mayúsculas, espaciado 0.04em): el título de cada página (`h1`). Si el título es un desplegable, la clase va en el `h1` y el botón hereda la letra.
- **Section** (`.type-section`; Orbitron 700, 1.125rem, mayúsculas, espaciado 0.06em): títulos de sección y de la tarjeta de estado principal.
- **Card** (`.type-card`; Orbitron 700, 0.8125rem, mayúsculas, espaciado 0.08em): títulos de tarjeta y de gráfica (`ChartCard`).
- **KPI** (`.type-kpi`; VT323, 2.4rem, interlineado 1, cifras tabulares): la cifra protagonista de una tarjeta.
- **Value** (`.type-value`; Geist Mono 600, 1.125rem, cifras tabulares): cifras secundarias agrupadas (paneles de totales).
- **Title** (`.type-title`; Geist Mono 600, 1.125rem): frase de estado o veredicto dentro de una tarjeta.
- **Body** (Geist Mono 400, 0.875rem): explicaciones, subtítulos de gráfica y tablas; las notas largas, con `max-w-prose`.
- **Label** (`.type-label`; Geist Mono 500, 0.75rem, grisáceo, en minúsculas normales): el nombre de una cifra.

Los títulos llevan `text-wrap: balance` y los párrafos `text-wrap: pretty` (en `main`).

### Named Rules

**La regla del color que significa.** El color solo aparece para decir algo: estado (verde/ámbar/rojo) o serie de una gráfica. Ningún elemento lleva color por decoración.

**La regla del texto primero.** Ningún estado se transmite solo con color: siempre hay una palabra ("Dentro de tu rango", "Carga baja") o una flecha con texto.

**La regla de las cuatro series.** Una gráfica tiene como mucho cuatro series de color; si hacen falta más, se divide en gráficas sincronizadas.

## Typography

**Display Font:** Orbitron 700/900 (con Geist Mono de respaldo)
**Body Font:** Geist Mono Variable (con `ui-monospace`)
**Numeric Font:** VT323 (con `ui-monospace`)

**Character:** Geist Mono da a todo el panel la voz de un instrumento de medida, alineando cifras sin esfuerzo. Orbitron pone la etiqueta de hardware en los títulos y VT323 convierte las cifras protagonistas en una pantalla de LED.

### Hierarchy

- **Display** (Orbitron 900, 1.9rem, mayúsculas, espaciado 0.04em): el título de cada página (`main h1`).
- **Headline** (Orbitron 700, 0.95em, mayúsculas, espaciado 0.06em): títulos de sección y de tarjeta (`main h2`, `main h3`) y la navegación principal.
- **Numeric** (VT323, 2.4rem, interlineado 1): cifras grandes de KPI (todo `.text-2xl` y `.text-4xl` dentro de `main`).
- **Title** (Geist Mono 600, 1rem): frase de estado dentro de una tarjeta ("Todo dentro de tu rango normal").
- **Body** (Geist Mono 400, 0.875rem): explicaciones, subtítulos de gráfica y tablas.
- **Label** (Geist Mono 500, 0.75rem): etiquetas de KPI, variaciones, notas de confianza y datos de las tablas de "Ver datos".

### Named Rules

**La regla de las cifras alineadas.** Toda cifra que se compara va en `tabular-nums`, para que las columnas no bailen.

**La regla del título en mayúsculas.** Orbitron solo aparece en mayúsculas y en títulos o navegación; nunca en párrafos ni en cifras.

## Layout

- Contenedor centrado de 72rem (`max-w-6xl`) con 16 px de margen lateral, igual en la barra superior y en el contenido.
- Barra superior fija y translúcida (fondo al 80 % con desenfoque): perfil a la izquierda; Salud, Rendimiento, Actividades y el botón de tema a la derecha. En móvil, la navegación se desplaza en horizontal antes que partirse.
- Las páginas se organizan en secciones con un título en Orbitron y, a la derecha, su selector de periodo o filtro (pestañas).
- Rejillas de tarjetas que pasan de una columna en móvil a dos o tres en escritorio; las cifras de una tarjeta de estado se reparten en una subrejilla de tres columnas en escritorio.
- Relleno interno de tarjeta de 20 px; separación entre secciones de unos 32 px.
- Tablas en móvil: las columnas secundarias se ocultan por debajo de `sm` (640 px).
- Diseño comprobado a 500 px (móvil) y 1280 px (escritorio), en claro y oscuro.

## Elevation & Depth

Sistema plano con una sola sombra, dura y sin desenfoque, que hace de canto de tarjeta impresa. No hay sombras difusas de elevación; la profundidad en oscuro sale del escalón tonal entre fondo y tarjeta. Los desplegables y el menú usan la sombra media de shadcn (`shadow-md`) porque flotan sobre el contenido.

### Shadow Vocabulary

- **Canto de tarjeta** (`box-shadow: 4px 4px 0 var(--border)`; en oscuro `4px 4px 0 oklch(1 0 0 / 8%)`): todas las tarjetas (`.bg-card`).
- **Panel flotante** (`shadow-md` de Tailwind): menús desplegables de la navegación y del perfil.

### Named Rules

**La regla de la sombra dura.** Las tarjetas proyectan una sombra sólida desplazada 4 px, nunca un halo difuso.

## Shapes

Esquinas rectas en todo (`--radius: 0`): tarjetas, pestañas, botones, menús y campos. Los bordes son de 1 px en el gris de cuadrícula. Las tarjetas de estado añaden un borde izquierdo de 4 px en el color del estado. Las únicas formas redondas son los puntos de estado de las listas de señales y la foto de perfil.

## Components

### Buttons

Sobrios y rectangulares.

- **Shape:** esquinas rectas (0 px).
- **Primary:** fondo tinta, texto papel, 8 × 12 px de relleno (más en los avisos de conexión), 0.875rem en peso 500.
- **Hover / Focus:** el fondo baja al 90 %; anillo de foco de 3 px en `ring` al 50 %.
- **Ghost (botón de tema):** solo el icono, de 16 px, en grafito al 60 %; al pasar por encima o con foco, fondo `accent` y texto pleno.

### Tabs (selector de periodo y filtros)

- **Style:** grupo de 36 px de alto sobre fondo `muted` con 3 px de relleno; cada opción es un enlace (`?semanas=`, `?carga=`) que conserva el resto de parámetros.
- **State:** la opción activa toma fondo de página, texto pleno y una sombra mínima; en oscuro, un borde `input`. Las inactivas van en grafito y se aclaran al pasar por encima.

### Cards / Containers

- **Corner Style:** rectas (0 px).
- **Background:** `card`, con borde de 1 px en `border`.
- **Shadow Strategy:** canto de tarjeta (ver Elevation & Depth).
- **Internal Padding:** 20 px.
- **KPI (StatCard):** etiqueta en grafito, cifra en LED con la unidad pequeña en grafito, variación con flecha + porcentaje (verde si mejora, rojo si empeora, gris si no cambia) y una línea de pista opcional.
- **Gráfica (ChartCard):** título en Orbitron, subtítulo que explica qué se compara, gráfica ApexCharts a partir de un `ChartSpec` y un desplegable "Ver datos" con la tabla accesible. Sin datos: "Sin datos en este periodo" centrado.

### Status Card (tarjeta "Hoy" y "Estado de forma")

La pieza que define el sistema. Tarjeta con borde izquierdo de 4 px en el color del estado, título de sección, frase de estado en peso 600, explicación en grafito y una nota de confianza en tamaño Label. Debajo, la lista de señales: punto de color, nombre, comparación con tu rango y la cifra alineada a la derecha.

### Navigation

- Enlaces de 0.875rem en Orbitron mayúsculas, con 6 × 12 px de relleno; inactivos en grafito, con fondo `accent` al pasar por encima.
- El activo lleva fondo `accent`, texto pleno y `aria-current="page"`.
- Actividades es un desplegable de 256 px de ancho con título y descripción por opción.
- En móvil, la fila de enlaces se desplaza en horizontal y el nombre del perfil se oculta.

### Tables

- Cabecera en grafito sobre `muted` al 50 %, fija al desplazar; filas separadas por una línea de cuadrícula; cifras en `tabular-nums`.

## Do's and Don'ts

### Do:

- **Do** usar los tokens semánticos (`bg-card`, `text-muted-foreground`, `border-border`, `--viz-*`) y no colores sueltos.
- **Do** acompañar cada estado de una palabra y cada variación de flecha + texto.
- **Do** explicar en la tarjeta qué se compara y cuánta confianza merece, en tamaño Label y en grafito.
- **Do** mantener las esquinas a 0 px y la sombra dura de 4 px en cualquier tarjeta nueva.
- **Do** comprobar cada pantalla a 500 px y 1280 px, en claro y en oscuro.
- **Do** fijar en el propio componente, con `<style>`, los colores críticos (trofeo, etiquetas de competición, calendario).

### Don't:

- **Don't** usar neones, degradados de color ni brillos: el guiño ochentero vive en la tipografía y la forma, no en el color.
- **Don't** usar doble eje Y ni más de cuatro series de color en una gráfica.
- **Don't** usar barras para el ritmo: no empiezan en cero; usa línea con puntos.
- **Don't** usar Orbitron en párrafos o cifras, ni VT323 fuera de las cifras grandes.
- **Don't** usar sombras difusas en las tarjetas ni esquinas redondeadas.
- **Don't** inventar puntuaciones opacas ni mostrar un estado solo con color.
