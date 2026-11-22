/**
 * Formularios del menú de perfil: guarda o elimina la API key, deja un aviso de un solo uso
 * y vuelve a la página de origen con el menú abierto (#perfil). Solo POST.
 */
import type { APIRoute } from 'astro';
import { clearSettings, secretConfigured, writeSettings } from '../../lib/settings';
import { forgetToken, getAccessToken, GarminAuthError } from '../../lib/garmin/auth';
import { setFlash, type Flash } from '../../lib/flash';

/** Solo rutas internas, para no convertir el formulario en una redirección abierta. */
const safePath = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : '/');

export const POST: APIRoute = async ({ request, cookies, locals, url, redirect }) => {
  const form = await request.formData();
  const action = form.get('action');
  const secure = url.protocol === 'https:';
  const settings = { ...locals.settings };
  let flash: Flash;

  if (action === 'save') {
    const apiKey = String(form.get('garminApiKey') ?? '').trim();
    if (!apiKey) {
      flash = { type: 'error', text: 'Pega tu API key antes de guardar.' };
    } else {
      try {
        await getAccessToken(apiKey, { force: true }); // valida contra Garmin antes de guardar
        settings.garminApiKey = apiKey;
        writeSettings(cookies, settings, secure);
        flash = { type: 'success', text: 'Cuenta de Garmin conectada correctamente.' };
      } catch (err) {
        flash = {
          type: 'error',
          text:
            err instanceof GarminAuthError || !secretConfigured()
              ? (err as Error).message
              : 'Error inesperado al validar la key.',
        };
      }
    }
  } else if (action === 'remove') {
    if (settings.garminApiKey) forgetToken(settings.garminApiKey);
    delete settings.garminApiKey;
    if (Object.keys(settings).length) writeSettings(cookies, settings, secure);
    else clearSettings(cookies);
    flash = { type: 'success', text: 'Key de Garmin eliminada.' };
  } else {
    flash = { type: 'error', text: 'Acción no reconocida.' };
  }

  setFlash(cookies, flash, secure);
  return redirect(`${safePath(form.get('redirect'))}#perfil`, 303);
};
