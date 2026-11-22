# Garmin Connect Stats — guía para agentes

Panel personal de estadísticas a partir de los datos de **Garmin Connect** (Personal API oficial).
Responde a dos preguntas: **Salud** (¿cómo estoy hoy y llevo una vida sana?) y **Rendimiento**
(¿mi entrenamiento me hace mejor, más eficiente y más rápido?), más el detalle de **Actividades**,
**Competiciones** y un **Comparador** entre años.

Hoy es para un único usuario, pero está pensado para que cualquiera use su propia API key:
nada depende de un usuario concreto y todo se separa por el hash de la key.

Idioma: **toda la interfaz, los textos, los comentarios y los commits van en español**.

Licencia: **todos los derechos reservados** (`LICENSE`). El repositorio es público solo para consultarlo;
no cambies la licencia ni añadas una de código abierto.

---

## Stack

| Pieza                                                      | Uso                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| **Astro 7** (`output: 'server'`)                           | Páginas SSR: la key y el token nunca llegan al navegador       |
| **@astrojs/vercel**                                        | Despliegue en Vercel (funciones serverless)                    |
| **Tailwind CSS v4** (`@tailwindcss/vite`) + **Flowbite 4** | Estilos y componentes (desplegables, etc.)                     |
| **ApexCharts 8**                                           | Gráficas, siempre a través de `ChartSpec` (ver abajo)          |
| **Leaflet** + **OpenStreetMap / OpenTopoMap**              | Mapa del recorrido                                             |
| **openapi-fetch** + **openapi-typescript**                 | Cliente tipado generado desde la spec OpenAPI de Garmin        |
| **@garmin/fitsdk** + **fflate**                            | Descomprimir y decodificar el archivo `.FIT` de cada actividad |
| **@vercel/analytics**                                      | Analítica web (`<Analytics />` en el layout)                   |
| **TypeScript 6**, **Vitest 5**                             | Tipos y tests                                                  |

Sin base de datos: todo se pide en directo a la API, con cachés en memoria.

## Comandos

Gestor de paquetes: **pnpm** (versión fijada en `packageManager` de `package.json`; con Corepack se usa sola).
No uses npm ni yarn: el lockfile es `pnpm-lock.yaml`.

```bash
pnpm install         # instala exactamente lo del lockfile
pnpm dev             # servidor de desarrollo (ver "Servidor de desarrollo")
pnpm build           # build de producción (salida en .vercel/output)
pnpm check           # astro check: tipos de .astro y .ts
pnpm test            # vitest run
pnpm lint            # Biome lint (incluye frontmatter y plantilla de los .astro); pnpm lint:fix corrige lo automático
pnpm fmt             # Biome format: ts/js/json/css y .astro completos; pnpm fmt:check solo comprueba
pnpm fix             # biome check --write: formato + correcciones seguras de lint de una vez
pnpm verify          # biome check + astro check + vitest (lo que hay que pasar antes de subir)
pnpm gen:api         # regenera src/lib/garmin/schema.d.ts desde docs/garmin-personal-api.json
```

**Versiones fijadas**: todas las dependencias van con versión exacta (sin `^` ni `~`). Para añadir o
actualizar una, usa `pnpm add <paquete>@<versión exacta>` (o `pnpm add -E`) y deja el `package.json` sin rangos.

`gen:api` usa `openapi-typescript@7.13.0` con TypeScript 5.9.3 vía `pnpm dlx`, porque su dependencia
choca con TypeScript 6 del proyecto. No lo instales como dependencia.

**Antes de dar algo por terminado:** `pnpm verify` en verde y `pnpm build` OK.

**CI** (`.github/workflows/ci.yml`): en cada PR y en cada push a `main`, GitHub Actions instala con
`pnpm install --frozen-lockfile` y ejecuta `biome ci`, `pnpm check`, `pnpm test` y `pnpm build`. Si algo
falla, el PR queda en rojo: no se fusiona hasta que pase.
`main` está **protegida**: no se puede fusionar ningún PR (ni hacer push directo) si la comprobación
"Formato, lint, tipos, tests y build" no está en verde; tampoco se permiten force push ni borrar la rama,
y la regla aplica también a los administradores.

**Estilo de código**: lo marca **Biome** (`biome.json`): 2 espacios, comillas simples, punto y coma, comas
finales y 120 columnas.

- En `.astro` está activado el **modo completo de HTML** de Biome (`html.experimentalFullSupportEnabled`):
  formatea y revisa el frontmatter **y la plantilla** (incluidas reglas de accesibilidad), con
  `indentScriptAndStyle` para mantener la sangría de `<script>` y `<style>`. Al ser experimental, si un
  formateo cambia algo visible, compara el texto renderizado antes/después y repórtalo.
- Como Biome ve la plantilla, `noUnusedImports`/`noUnusedVariables` funcionan también en `.astro`.
- `noNonNullAssertion` está desactivada: el código usa `!` a propósito tras comprobaciones previas.
- Para saltarse una regla, `// biome-ignore lint/<grupo>/<regla>: motivo` con el motivo explicado.
- Excluidos: `schema.d.ts` (generado), la spec OpenAPI y el lockfile.

**SonarCloud** (calidad y seguridad del código): conectado como **app de GitHub con análisis automático**;
no hay workflow ni `sonar-project.properties` en el repo. Analiza cada push a `main` y cada PR y publica la
comprobación "SonarCloud Code Analysis" (no es obligatoria para fusionar; la obligatoria es la CI).

- Panel: https://sonarcloud.io/dashboard?id=diegoberges_garmin-connect-stats (proyecto público).
- Consulta rápida por API (pública, sin token), por ejemplo los problemas abiertos de un tipo:

  ```bash
  curl -s "https://sonarcloud.io/api/issues/search?componentKeys=diegoberges_garmin-connect-stats&resolved=false&types=VULNERABILITY"
  curl -s "https://sonarcloud.io/api/measures/component?component=diegoberges_garmin-connect-stats&metricKeys=bugs,vulnerabilities,code_smells,coverage"
  ```

- **No introduzcas problemas nuevos** en un PR: revisa la comprobación de SonarCloud antes de fusionar.
- Reglas que más salen y conviene respetar en código nuevo:
  - complejidad cognitiva ≤ 15 por función (`S3776`): divide funciones largas en auxiliares;
  - nada de ternarios anidados (`S3358`): usa `if`/`else` o una función;
  - GitHub Actions fijadas por **SHA completo** del commit, no por etiqueta (`S7637`);
  - sin URLs `http://` (`S5332`), aunque sean de relleno;
  - no repitas uniones de tipos: dale nombre con un `type` (`S4621`).

### Servidor de desarrollo

Arráncalo en segundo plano:

```
pnpm astro dev --background
```

Gestiónalo con `pnpm astro dev stop`, `pnpm astro dev status` y `pnpm astro dev logs`. El usuario suele tener su
propio servidor en `localhost:4321` con su key real en la cookie: no lo pares.

Para probar sin key, usa las capturas locales en otro puerto:

```bash
GARMIN_FIXTURES=1 pnpm astro dev --port 4322 --ignore-lock
```

---

## Estructura

```
src/
  layouts/Base.astro          # barra superior (perfil a la izq., menú a la dcha.), tema, indicador de carga, analítica
  middleware.ts               # lee ajustes (cookie cifrada) y el aviso flash en locals
  pages/
    index.ts                  # / → redirige a /salud
    salud.astro               # Hoy, Recuperación, Vida sana, Contexto
    rendimiento.astro         # Estado de forma, carga, intensidad, carrera, marcas, eficiencia
    actividades/index.astro   # listado por tipo (desplegable en el título), paginado
    actividades/[id].astro    # detalle: mapa, resumen, series sincronizadas, parciales, zonas
    competiciones.astro       # actividades con eventType=race
    comparador.astro          # comparación entre años
    api/ajustes.ts            # POST de los formularios del perfil (key, sexo)
    dev/capture.ts            # SOLO DEV: guarda respuestas reales en .data/raw/
  components/                 # StatCard, ChartCard, ActivityTable, Pagination, RangeSelector,
                              # ProfileMenu, RouteMap, TrophyTip, LoadingIndicator, …
  lib/
    garmin/                   # todo lo que habla con Garmin
      auth.ts                 # API key → access token (24 h), caché por hash de key
      client.ts               # cliente openapi-fetch: auth, caché TTL, reintento 401, memo
      schema.d.ts             # GENERADO desde la spec, no editar a mano
      types.ts                # tipos de la API derivados de la spec + tipos de dominio
      running.ts              # actividades (lista, detalle, histórico, competiciones), zonas, VO2máx
      wellness.ts             # salud diaria (resúmenes, sueño, HRV) por bloques de 28 días
      track.ts                # descarga y procesado del FIT: ruta, series, parciales, GAP, desacoplamiento
      fitness-age.ts          # Edad física y sus palancas
      profile.ts              # datos del menú de perfil
      fixtures.ts             # cliente falso con las capturas de .data/raw (solo dev)
    baseline.ts               # Salud: rangos personales, estado de hoy, minutos de intensidad
    load.ts                   # Rendimiento: carga, forma física/fatiga/forma, intensidad, marcas
    efficiency.ts             # Rendimiento: Minetti, EF, VDOT, velocidad crítica
    compare.ts                # Comparador: totales por mes y año
    races.ts                  # categorías de competición y mejores marcas
    vo2-norms.ts              # percentiles de VO2máx (FRIEND 2015)
    activity-kinds.ts         # familia de cada tipo (a pie, ciclismo, natación, otros)
    stats.ts, dates.ts, format.ts, settings.ts, flash.ts, chart-spec.ts
  scripts/charts.ts           # convierte ChartSpec en ApexCharts en el navegador
  styles/global.css           # Tailwind, Flowbite, tokens --viz-*, modo oscuro zinc
docs/garmin-personal-api.json # spec OpenAPI (la fuente de verdad de rutas y tipos)
```

---

## Garmin Personal API: cómo funciona

- **Autenticación**: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`
  con `Authorization: ApiKey <key>` y **sin** cabecera `Accept` (con ella responde 406).
  Devuelve un token de unas 24 h y no hay refresh token, así que se vuelve a pedir.
  Los tokens se guardan en memoria por hash de la key.
- **Datos**: base `https://personal.connectapi.garmin.com`, con `Authorization: Bearer <token>`.
- **Los tipos salen de la spec OpenAPI** (`docs/garmin-personal-api.json` → `schema.d.ts`).
  No escribas a mano tipos de respuesta: usa `ApiJson<'/ruta'>` y `Loose<T>` de `types.ts`.
- **Cachés** (todas en memoria y por usuario, así que en Vercel duran lo que viva cada instancia):
  - Respuestas JSON: 5 min (`client.ts`).
  - `client.memo(clave, ttl, fn)` para resultados procesados:
    - FIT procesado: 1 h.
    - Historial de carreras, de actividades y competiciones: 6 h.
  - Máximo 30 entradas en `memo`.
- **Rangos de fechas**: la salud diaria se pide en bloques de 28 días. El historial completo
  empieza en `2000-01-01` y se pagina de 100 en 100.
- **El GPS y las series por segundo solo están en el FIT**:
  `/download-service/files/activity/{id}` devuelve un ZIP con el `.fit`. No hay endpoint JSON de streams.
- **No expuesto por la API** (hay que calcularlo nosotros si se quiere):
  - Training Readiness, Training Status y la carga aguda/crónica diaria.
  - Recovery Time, Endurance/Hill Score y el predictor de carrera.
  - La lista de récords personales: solo hay una marca `pr` / `personalRecord` por actividad.
- **Desviaciones conocidas entre la spec y la realidad** (documentadas en `types.ts`, compruébalas siempre con datos reales):
  - Muchos campos llegan `null` aunque la spec no lo diga.
  - `sleep*Timestamp*` llega como epoch ms, no como string.
  - `bodyBatteryValuesArray` y `heartRateValues` llegan como tuplas `[epochMs, valor]`.
  - `/fitnessage-service/fitnessage/v2/{date}` devuelve **un objeto**, no una lista.
- **Filtros útiles de la búsqueda de actividades**:
  - `activityType` admite solo tipos padre (`running` incluye trail y cinta).
  - `eventType=race` devuelve las competiciones.

### Capturas reales para desarrollar

`/dev/capture` (solo en dev) llama a los endpoints con la key de la cookie y guarda las respuestas en
`.data/raw/`, incluido el FIT de la última carrera. Se usan para:

- modelar tipos y comprobar desviaciones de la spec;
- el modo `GARMIN_FIXTURES=1`, que repite las series diarias para cubrir el rango pedido;
- los tests de `mappers.test.ts`, que se saltan si no hay capturas.

---

## Seguridad y privacidad (obligatorio)

- **La API key nunca se escribe en disco ni se registra en logs.** Vive solo en la cookie `gcs_settings`:
  - cifrada con AES-256-GCM, `httpOnly`, `sameSite=strict`;
  - con la clave derivada de `APP_SECRET`.
- **`APP_SECRET` es obligatorio en producción** (variable de entorno en Vercel). En dev, si falta,
  se genera uno en `.data/app-secret`.
- **`.data/` contiene datos personales reales** (capturas, FIT, secreto de dev). Está en `.gitignore`:
  no la subas, no la compartas y no envíes su contenido a servicios externos.
- No pongas datos personales en URLs ni en servicios externos. Las teselas del mapa sí van a
  OpenStreetMap/OpenTopoMap, que ven la zona del mapa (aceptado).
- **Cabeceras de seguridad** (`lib/security-headers.ts`, aplicadas en `middleware.ts` a todas las respuestas):
  sin iframes (`frame-ancestors 'none'` + `X-Frame-Options`), `nosniff`, `Referrer-Policy`,
  `Permissions-Policy` y COOP. HSTS lo pone Vercel. Aún no hay CSP de scripts: haría falta un nonce por
  petición para los scripts en línea.
- Formularios: POST a `/api/ajustes`, redirección 303 a la página de origen (solo rutas internas,
  sin redirección abierta) y aviso de un solo uso en la cookie `gcs_flash`.

---

## Páginas y criterios de las métricas

Los criterios y su evidencia están en el informe `reports/Métricas de salud y rendimiento.md`
(generado en la investigación; ojo, `reports/` y `research_notes/` están excluidos de git en local).
**Los umbrales heurísticos están centralizados como constantes** en `baseline.ts`, `load.ts` y
`efficiency.ts`: cámbialos ahí, no en las páginas. La interfaz debe decir cuándo algo es orientativo.

### Salud (`/salud`)

- **Hoy**: cada señal se compara con el **propio rango del usuario**, no con valores absolutos.
  - HRV: media de 7 días de ln(HRV) frente a una banda de 60 días (μ ± 0,75σ). Hacen falta 21 noches.
  - FC en reposo: frente a la mediana de 60 días; alerta a partir de +5 ppm.
  - Respiración nocturna: frente a la mediana de 30 días; alerta a partir de +1,5 rpm.
  - Deuda de sueño: 7 noches frente a la necesidad que calcula Garmin; alerta a partir de 4 h.
  - Estado según las señales fuera de rango: 0–1 normal, 2 atención, ≥3 posible enfermedad o mala recuperación.
    Sin datos suficientes, "calibrando".
- **Recuperación** (30 días): HRV y FC en reposo con banda de rango normal; horas de sueño frente a la necesidad.
- **Vida sana**:
  - Edad física con sus palancas.
  - VO2máx con margen ±5 % y percentil por sexo y edad (FRIEND 2015; el sexo se guarda en el perfil).
  - Minutos de intensidad semanales (moderados + vigorosos ×2) frente a los 150 de la OMS.
  - Pasos frente a una meta por edad.
- **Contexto** (evidencia limitada): Body Battery, estrés (se muestra como "activación fisiológica") y fases del sueño.

### Rendimiento (`/rendimiento`)

- **Carga**:
  - Por sesión, la `activityTrainingLoad` de Garmin; si falta, TRIMP de Edwards con las zonas.
  - Forma física (media exponencial de 42 días), fatiga (7 días) y forma en % de la forma física, con zonas orientativas.
  - Estado "calibrando" con menos de 42 días desde la primera carga.
- Carga semanal por tipo con aviso si sube más de un 25 % sobre la media de 4 semanas; días de fuerza.
- **Distribución de intensidad**: Z1–Z2 baja, Z3 moderada, Z4–Z5 alta, con la referencia del 80 % suave.
- **Carrera**: esta semana frente al mismo tramo de la anterior, totales del periodo y km por semana.
- **Mejores marcas**: últimos 12 meses frente al histórico, a partir de `fastestSplit_*` de cada actividad.
- **Eficiencia** (fase 3):
  - Factor de eficiencia (m/min ÷ FC) solo en rodajes comparables: asfalto/cinta, 30–120 min,
    ≤ 15 m/km de desnivel y efecto base/recuperación.
  - Ritmo a la FC mediana de rodaje.
  - Desacoplamiento de las últimas 8 tiradas de 60 minutos o más (FIT, ritmo ajustado por pendiente de Minetti).
  - Predicción con VDOT de Daniels, velocidad crítica y curva de marcas.

### Actividades

- `/actividades`: el título es un desplegable con los tipos del periodo. Indicadores, gráficas y tabla
  se adaptan a la familia (`activity-kinds.ts`):
  - a pie: ritmo en min/km;
  - ciclismo: km/h;
  - natación: ritmo por 100 m;
  - resto: tiempo, FC y calorías.

  La tabla se pagina de 20 en 20 (`?pagina=`).

- `/actividades/[id]`:
  - mapa (topográfico en trail y montaña, callejero en el resto) junto a las cifras clave;
  - ritmo, FC y altitud con el cursor sincronizado;
  - parciales por km, zonas de FC y dinámica de carrera.
- `/competiciones`: `eventType=race` de todo el historial, por años; mejor marca de 5K, 10K, media y
  maratón con trofeo; etiquetas por distancia (maratón > media > 10K > 5K).
- `/comparador`:
  - tipo de actividad (incluido "Correr" = carrera + trail + cinta) y hasta 4 años;
  - del 1 de enero a hoy, km o tiempo por mes, acumulado anual y resumen por año.

---

## Convenciones de interfaz

- **Web moderna**: antes de tocar HTML, CSS o JS del navegador, consulta la skill **Modern Web Guidance**
  (plugin `modern-web-guidance@googlechrome`), con `search`/`retrieve`, y sigue la guía que aplique.
  Para buscar patrones antiguos en todo el código: `pnpx modern-web-guidance@latest legacy-scan src`.
- **Navegadores soportados**: lo que sea **Baseline ampliamente disponible** se usa sin alternativas. Lo
  **recién disponible** o con soporte limitado solo con detección y degradación elegante: la página tiene
  que seguir funcionando sin ello. Nada de polyfills pesados; si hace falta una alternativa, que sea
  corta (unas 20 líneas) y sin dependencias nuevas.

- **Formato es-ES** (`format.ts`): coma decimal, unidades métricas, zona horaria Europe/Madrid y semanas de lunes a domingo.
- **Navegación**:
  - menú de perfil a la izquierda, con foto, nombre, key, sexo y estado de la conexión;
  - Salud, Rendimiento y Actividades a la derecha. Actividades es un desplegable con Actividades,
    Competiciones y Comparador.
- **Modo oscuro** (`lib/theme.ts`, `scripts/theme.ts` y el script en línea de `Base.astro`):
  - Sin preferencia guardada se sigue al sistema. La preferencia va en `localStorage` (`theme`).
  - `<meta name="color-scheme">` lleva `light dark` (sistema), `light` o `dark`. De él sale `color-scheme`
    en `:root`, que hace que los controles nativos y las barras de desplazamiento sigan al tema.
  - La clase `.dark` en `<html>` se calcula del mismo valor: de ella dependen Tailwind, Flowbite y las gráficas.
  - El botón pasa al tema contrario del que se ve; si coincide con el del sistema, **borra** la preferencia
    (no la guarda), para que siempre se pueda volver a seguir al sistema. Su texto dice qué hará.
  - En oscuro, la paleta `gray-*` se redirige a `zinc` (en `global.css`); en claro, `gray` normal y fondos blancos.
- **Gráficas**:
  - Siempre con un `ChartSpec` serializado en `data-chart`. Nunca uses ApexCharts directamente en una página.
  - Colores desde los tokens `--viz-*` (paleta validada en claro y oscuro), máximo 4 series de color.
  - **Nunca doble eje Y**: si hacen falta dos magnitudes, usa dos gráficas sincronizadas (`group`).
  - El ritmo va con el eje invertido (más rápido arriba) y escalas redondas.
  - Toda gráfica de `ChartCard` ofrece "Ver datos" (tabla accesible).
  - Las bandas de rango normal se hacen con `band` (rangeArea) y siempre llevan leyenda.
  - Las barras de ritmo no tienen sentido (no empiezan en cero): para parciales, usa línea con puntos.
- **Tarjetas de estado**: borde izquierdo de color con estado en texto (nunca solo color) y
  variaciones con flecha + texto.
- **Tablas en móvil**: oculta las columnas secundarias por debajo de `sm`, para no obligar a desplazarse de lado.
- **Colores críticos** (trofeo, etiquetas de competición): van fijados en el propio componente con
  `<style>`, no con clases que dependan de que Tailwind las genere.
- **Indicador de carga**: `LoadingIndicator` se muestra al navegar y al enviar formularios.
  - Para un mensaje propio, usa `data-loading="…"` en el enlace o formulario.
  - Para desactivarlo, `data-no-loading`.
  - Si una página nueva carga datos lentos, añade su mensaje en `messageFor()`.
- **Textos**: explica en la propia tarjeta qué se compara y cuánta confianza merece
  ("orientativo", "evidencia limitada"). Nada de puntuaciones opacas inventadas.

---

## Cómo trabajar en este repo

1. **Rama nueva desde `main`** para cada cambio (`feat/…`, `fix/…`).
2. Implementa, con tests en `src/lib/*.test.ts` para toda lógica de cálculo nueva.
3. Verifica: `pnpm verify` y `pnpm build` (ejecuta antes `pnpm fix` si has tocado código).
4. **Revisa la interfaz** con el servidor de fixtures (puerto 4322) y capturas con Chrome headless,
   en escritorio y móvil (500 px), modo claro y oscuro:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
     --hide-scrollbars --window-size=1280,1600 --virtual-time-budget=8000 \
     --screenshot=.data/captura.png http://localhost:4322/ruta
   ```

   - Para el modo claro, añade `--blink-settings=preferredColorScheme=1`.
   - Guarda las capturas en `.data/` y bórralas al terminar.

5. **Subir y desplegar solo cuando el usuario lo pida**:
   - commit en español con la línea `Co-Authored-By` indicada;
   - PR con `gh`, con resumen y pruebas en español, terminado con la línea de Claude Code;
   - espera a la CI (`gh pr checks <n>`); GitHub no deja fusionar hasta que esté en verde;
   - `gh pr merge --merge --delete-branch`;
   - Vercel despliega `main` solo: espera al estado del commit con
     `gh api repos/<owner>/<repo>/commits/<sha>/status`.
6. Si algo no se ha podido verificar con datos reales, dilo explícitamente.

## Pendiente (hoja de ruta)

- **Salud**:
  - regularidad del sueño;
  - FC en reposo a 12 meses;
  - etiquetas manuales (alcohol, viaje, enfermo) que excluyan esos días de los rangos.
- **Refinamientos**:
  - monotonía de la carga;
  - peso/IMC;
  - sedentarismo;
  - HRV a 12 meses;
  - dinámicas de carrera según el ritmo;
  - indicador de subidas.
- **Comparador**: pulir estadísticas con el usuario.
- **Posible**: base de datos para el histórico (hoy todo es en directo con caché en memoria) y modo multiusuario.

---

## Documentación de Astro

Documentación completa: https://docs.astro.build

Consulta estas guías antes de trabajar en tareas relacionadas:

- [Páginas, rutas dinámicas o middleware](https://docs.astro.build/en/guides/routing/)
- [Componentes de Astro](https://docs.astro.build/en/basics/astro-components/)
- [Componentes de React, Vue, Svelte u otros frameworks](https://docs.astro.build/en/guides/framework-components/)
- [Contenido y colecciones](https://docs.astro.build/en/guides/content-collections/)
- [Estilos y Tailwind](https://docs.astro.build/en/guides/styling/)
- [Internacionalización](https://docs.astro.build/en/guides/internationalization/)
