/**
 * Formularios del menú de perfil: guarda o elimina la API key y los datos del perfil, deja un aviso
 * de un solo uso y vuelve a la página de origen con el menú abierto (#perfil). Solo POST.
 */
import type { APIRoute, AstroCookies } from 'astro';
import { clearSettings, secretConfigured, writeSettings, type UserSettings } from '../../lib/settings';
import { forgetToken, getAccessToken, GarminAuthError } from '../../lib/garmin/auth';
import { setFlash, type Flash } from '../../lib/flash';
import { THRESHOLD_LIMITS, type AlertThresholds } from '../../lib/sleep-alert';

/** Campo de texto del formulario (un archivo u otro tipo cuenta como vacío). */
const textField = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};

/** Solo rutas internas, para no convertir el formulario en una redirección abierta. */
const safePath = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : '/');

interface Ctx {
  form: FormData;
  cookies: AstroCookies;
  settings: UserSettings;
  secure: boolean;
}

/** Guarda los ajustes en la cookie, o la borra si ya no queda nada. */
function persist({ cookies, settings, secure }: Ctx) {
  if (Object.keys(settings).length) writeSettings(cookies, settings, secure);
  else clearSettings(cookies);
}

/** Valida la key contra Garmin antes de guardarla. */
async function saveKey(ctx: Ctx): Promise<Flash> {
  const apiKey = textField(ctx.form, 'garminApiKey').trim();
  if (!apiKey) return { type: 'error', text: 'Pega tu API key antes de guardar.' };
  try {
    await getAccessToken(apiKey, { force: true });
    ctx.settings.garminApiKey = apiKey;
    writeSettings(ctx.cookies, ctx.settings, ctx.secure);
    return { type: 'success', text: 'Cuenta de Garmin conectada correctamente.' };
  } catch (err) {
    const known = err instanceof GarminAuthError || !secretConfigured();
    return { type: 'error', text: known ? (err as Error).message : 'Error inesperado al validar la key.' };
  }
}

function saveSex(ctx: Ctx): Flash {
  const sex = ctx.form.get('sex');
  if (sex === 'male' || sex === 'female') ctx.settings.sex = sex;
  else delete ctx.settings.sex;
  persist(ctx);
  return { type: 'success', text: 'Perfil actualizado.' };
}

/** Umbrales de la alerta de sueño: solo números dentro de su rango; un campo vacío vuelve al de por defecto. */
function saveAlert(ctx: Ctx): Flash {
  const alert: Partial<AlertThresholds> = {};
  for (const [key, { min, max }] of Object.entries(THRESHOLD_LIMITS) as [
    keyof AlertThresholds,
    { min: number; max: number },
  ][]) {
    const raw = textField(ctx.form, key).trim().replace(',', '.');
    if (!raw) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < min || v > max) {
      return { type: 'error', text: `Valor fuera de rango (${min}–${max}). No se ha guardado nada.` };
    }
    alert[key] = v;
  }
  if (Object.keys(alert).length) ctx.settings.alert = alert;
  else delete ctx.settings.alert;
  persist(ctx);
  return { type: 'success', text: 'Umbrales de la alerta guardados.' };
}

function resetAlert(ctx: Ctx): Flash {
  delete ctx.settings.alert;
  persist(ctx);
  return { type: 'success', text: 'Umbrales de la alerta restablecidos.' };
}

function removeKey(ctx: Ctx): Flash {
  if (ctx.settings.garminApiKey) forgetToken(ctx.settings.garminApiKey);
  delete ctx.settings.garminApiKey;
  persist(ctx);
  return { type: 'success', text: 'Key de Garmin eliminada.' };
}

// Map (no objeto literal): `action=constructor` u otras claves heredadas no deben encontrar nada
const ACTIONS = new Map<string, (ctx: Ctx) => Flash | Promise<Flash>>([
  ['save', saveKey],
  ['save-sex', saveSex],
  ['save-alert', saveAlert],
  ['reset-alert', resetAlert],
  ['remove', removeKey],
]);

export const POST: APIRoute = async ({ request, cookies, locals, url, redirect }) => {
  const form = await request.formData();
  const secure = url.protocol === 'https:';
  const handler = ACTIONS.get(textField(form, 'action'));
  const flash: Flash = handler
    ? await handler({ form, cookies, settings: { ...locals.settings }, secure })
    : { type: 'error', text: 'Acción no reconocida.' };
  setFlash(cookies, flash, secure);
  return redirect(`${safePath(form.get('redirect'))}#perfil`, 303);
};
