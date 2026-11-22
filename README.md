# garmin-connect-stats
Estadísticas con tus datos de Garmin Connect

Panel personal hecho con Astro (SSR, Node), Tailwind v4, Flowbite y ApexCharts, que usa la
[Garmin Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/).

## Puesta en marcha

```sh
pnpm install
pnpm dev           # http://localhost:4321
```

1. Crea tu Personal API Key en [Garmin Connect → Personal API Key](https://connect.garmin.com/app/settings/personalApiToken)
   (se muestra una sola vez).
2. Abre el **menú de perfil** (arriba a la izquierda) y pégala. Se valida contra Garmin y se guarda cifrada (AES-256-GCM) en una
   cookie httpOnly: el navegador no puede leerla.

### Secreto de cifrado
Define `APP_SECRET` (ver `.env.example`). Si no existe, la app genera uno y lo guarda en `.data/app-secret`
(ignorado por git). Si cambia el secreto, las keys guardadas dejan de ser válidas y hay que volver a pegarlas.

## Despliegue en Vercel
El proyecto usa `@astrojs/vercel` (SSR en funciones serverless); Vercel detecta Astro sin más configuración.

1. Importa el repo en Vercel (framework: Astro, comandos por defecto).
2. En *Settings → Environment Variables* añade **`APP_SECRET`** (obligatorio en producción), p. ej. generado con
   `openssl rand -base64 32`. Si lo cambias, habrá que volver a pegar la key de Garmin.
3. Despliega y pega tu Personal API Key en el **menú de perfil**.

Notas: las cachés de token y respuestas son en memoria por instancia (se pierden en arranques en frío, sin
impacto funcional). `/dev/capture` y el modo `GARMIN_FIXTURES` no existen en producción.

## Scripts
- `pnpm dev` — servidor de desarrollo
- `pnpm build` / `pnpm preview` — build de producción
- `pnpm check` — comprobación de tipos
- `pnpm test` — tests (Vitest)
- `pnpm gen:api` — regenera `src/lib/garmin/schema.d.ts` desde `docs/garmin-personal-api.json`

## API de Garmin
La spec OpenAPI (`docs/garmin-personal-api.json`, extraída de las
[Swagger docs](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)) es la fuente de
verdad: rutas, parámetros y respuestas se tipan desde ella con `openapi-typescript` + `openapi-fetch`.
Las desviaciones detectadas frente a respuestas reales están documentadas en `src/lib/garmin/types.ts`.

### Utilidades de desarrollo
- `/dev/capture` (solo dev): guarda respuestas reales en `.data/raw/` (ignorado por git) para contrastarlas con
  la spec. Los tests de mapeadores las usan si existen.
- `GARMIN_FIXTURES=1 pnpm dev`: sirve esas capturas en lugar de llamar a Garmin, para revisar la UI sin key.
