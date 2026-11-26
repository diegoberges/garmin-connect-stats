# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un único usuario por ahora: el propio autor, deportista (sobre todo corredor, también trail, ciclismo, natación y fuerza) con reloj Garmin. Está preparado para que otra persona use su propia API key, pero hoy no se diseña pensando en terceros ni en entrenadores con varios deportistas.

Dos situaciones de uso, con el mismo peso:

- **Móvil, por la mañana**: un vistazo rápido a cómo está hoy (Salud, alerta de fatiga por sueño, disposición).
- **Escritorio, con calma**: analizar carga, progresión, actividades, competiciones y comparar años.

## Product Purpose

Panel personal de estadísticas a partir de la Garmin Connect Personal API oficial. Responde a dos preguntas:

- **Salud**: ¿cómo estoy hoy y llevo una vida sana?
- **Rendimiento**: ¿mi entrenamiento me hace mejor, más eficiente y más rápido?

Además ofrece el detalle de **Actividades**, **Competiciones**, un **Comparador** entre años y la **Calidad de datos** del historial. Funciona bien si el usuario entiende en segundos su estado de hoy y puede fiarse de cada cifra porque sabe de dónde sale.

## Positioning

Lo que no da la app de Garmin Connect:

- **Tu propio rango**: cada señal (VFC, FC en reposo, respiración, sueño) se compara con el historial del usuario, no con valores absolutos ni con la población.
- **Métricas transparentes**: fórmulas conocidas y documentadas (TRIMP de Banister, VDOT de Daniels, Minetti, Swain, Foster, FRIEND 2015), explicadas en la propia tarjeta, con su grado de confianza. Nada de puntuaciones opacas inventadas.

## Operating Context

- Datos en directo de la API de Garmin, sin base de datos; cachés en memoria por usuario.
- El GPS y las series por segundo salen del archivo `.FIT` de cada actividad.
- Garmin no expone por API Training Readiness, Training Status, Recovery Time ni el predictor de carrera: aquí se calculan con métodos propios y se dice cuándo son orientativos.
- Toda la interfaz en español (es-ES): coma decimal, unidades métricas, zona Europe/Madrid, semanas de lunes a domingo.

## Capabilities and Constraints

- Astro SSR en Vercel; la API key vive solo en una cookie cifrada y nunca llega al navegador ni se escribe en disco o logs.
- Páginas: Salud, Rendimiento, Actividades (listado y detalle con mapa y series sincronizadas), Competiciones, Comparador, Calidad.
- Los umbrales heurísticos están centralizados en `src/lib/` (baseline, load, efficiency, sleep-alert); la interfaz debe indicar cuándo algo es orientativo o tiene evidencia limitada.
- Ninguna petición GET cambia nada (hay precarga con Speculation Rules); todo lo que modifica va por POST.
- Navegadores: Baseline ampliamente disponible sin alternativas; lo más nuevo solo con degradación elegante.
- Modo claro y oscuro, siguiendo al sistema por defecto.
- Pendiente (no decidido): base de datos para el histórico y modo multiusuario.

## Brand Commitments

- Nombre: Garmin Connect Stats. No es un producto de Garmin y no debe parecerlo.
- Voz: español claro y honesto; explica qué se compara y cuánta confianza merece ("orientativo", "evidencia limitada").
- Licencia: todos los derechos reservados; el repositorio es público solo para consultarlo.

## Evidence on Hand

- Datos reales del usuario vía API (y capturas locales en `.data/raw/`, privadas: nunca se comparten ni se envían fuera).
- Criterios y evidencia de las métricas en `reports/Métricas de salud y rendimiento.md` (local, fuera de git).
- No hay testimonios, otros usuarios ni métricas de uso: no se inventan.

## Product Principles

1. **Tu normal es la referencia**: comparar con el rango personal antes que con valores absolutos.
2. **Cada cifra se puede explicar**: fórmula conocida, texto que dice qué se compara y cuánta confianza merece.
3. **Hoy en segundos, el análisis en profundidad**: el vistazo matinal en móvil y el estudio en escritorio son igual de importantes.
4. **Honestidad ante la falta de datos**: "calibrando" o "sin datos" antes que una cifra dudosa.
5. **Privacidad por defecto**: sin base de datos, la key cifrada, ningún dato personal fuera.

## Accessibility & Inclusion

- El estado nunca se transmite solo con color: siempre texto, y variaciones con flecha y texto.
- Toda gráfica ofrece "Ver datos" como tabla accesible.
- Animaciones de navegación desactivadas con movimiento reducido.
- Las tablas en móvil ocultan columnas secundarias para no obligar a desplazarse de lado.
