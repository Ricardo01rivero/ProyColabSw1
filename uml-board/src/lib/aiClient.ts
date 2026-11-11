/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cliente único de IA para toda la app (asistente, importar imagen y chat "IA Dev Senior").
 *
 * - "nube":  Gemini a través de la Edge Function `openai-proxy` de Supabase (la clave vive en Supabase).
 * - "local": un modelo abierto servido con Ollama (p. ej. Qwen2.5-VL 7B en Google Colab con GPU T4,
 *            expuesto con un túnel https). No usa claves ni servicios de terceros.
 *
 * `aiFetch(payload)` reemplaza a `fetch(OPENAI_PROXY_URL, ...)`: recibe el payload en formato
 * OpenAI (messages con texto e image_url) y devuelve una Response con el mismo formato
 * ({ choices: [{ message: { content } }] }), así los servicios no cambian según el proveedor.
 * La elección se guarda en este navegador (localStorage).
 */
import { OPENAI_PROXY_URL, SUPABASE_ANON_KEY } from './supabase.config';

export type AiProvider = 'nube' | 'local';
export type AiConfig = { provider: AiProvider; localUrl: string; localModel: string };

const KEY = 'umlboard.aiConfig';
const DEFAULTS: AiConfig = { provider: 'nube', localUrl: '', localModel: 'qwen2.5vl:7b' };
const LOCAL_TIMEOUT_MS = 180_000;
const LOCAL_MAX_IMAGE_SIDE = 1280; // menos tokens de imagen para un modelo de 7B

export const getAiConfig = (): AiConfig => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
};

export const setAiConfig = (cfg: Partial<AiConfig>): AiConfig => {
  const next = { ...getAiConfig(), ...cfg };
  next.localUrl = next.localUrl.trim().replace(/\/+$/, '');
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // almacenamiento no disponible: se usa solo en esta sesión
  }
  window.dispatchEvent(new CustomEvent('umlboard:ai-config', { detail: next }));
  return next;
};

/** Nombre corto del proveedor activo, para mostrar en la interfaz. */
export const describeAi = (cfg = getAiConfig()): string =>
  cfg.provider === 'local' && cfg.localUrl ? `Local · ${cfg.localModel}` : 'Nube · Gemini';

/** Comprueba que el servidor Ollama responde y tiene el modelo descargado. */
export async function testLocalAi(url: string, model: string): Promise<string> {
  const base = url.trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  const data = await res.json();
  const names: string[] = (data.models || []).map((m: any) => m.name);
  if (!names.includes(model)) {
    throw new Error(`Conecta, pero no tiene el modelo "${model}". Modelos: ${names.join(', ') || 'ninguno'}`);
  }
  return `Conectado: ${model} disponible`;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Convierte una imagen (URL pública o data:URL) a base64 sin prefijo, reducida para el modelo local. */
async function imageToBase64(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    if (!blob.type.startsWith('image/')) return null; // PDFs u otros: el modelo local no los lee
    let out: Blob = blob;
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, LOCAL_MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        out = (await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9))) || blob;
      }
      bmp.close();
    } catch {
      // si no se puede redimensionar se envía la original
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(out);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  } catch {
    return null;
  }
}

/** Formato OpenAI -> formato nativo de Ollama (/api/chat). */
async function toOllamaMessages(messages: any[]): Promise<any[]> {
  return Promise.all(
    (messages || []).map(async m => {
      if (typeof m.content === 'string') return { role: m.role, content: m.content };
      const texts: string[] = [];
      const images: string[] = [];
      for (const part of m.content || []) {
        if (part.type === 'text') texts.push(part.text);
        else if (part.type === 'image_url') {
          const b64 = await imageToBase64(part.image_url?.url || '');
          if (b64) images.push(b64);
          else texts.push('[Adjunto no compatible con la IA local: solo se analizan imágenes]');
        }
      }
      return { role: m.role, content: texts.join('\n'), ...(images.length ? { images } : {}) };
    })
  );
}

async function callLocal(cfg: AiConfig, payload: any): Promise<Response> {
  try {
    const res = await fetch(`${cfg.localUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
      body: JSON.stringify({
        model: cfg.localModel,
        stream: false,
        ...(payload.response_format?.type === 'json_object' ? { format: 'json' } : {}),
        options: {
          num_ctx: 16384, // el prompt de importación + la imagen no entran en los 4096 por defecto
          temperature: payload.temperature ?? 0.3,
          num_predict: payload.max_tokens || 2000,
        },
        messages: await toOllamaMessages(payload.messages),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return jsonResponse({ error: `IA local: ${data.error || res.status}` }, res.status);
    return jsonResponse({
      model: data.model,
      choices: [{ index: 0, message: { role: 'assistant', content: data.message?.content || '' } }],
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    });
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === 'TimeoutError';
    return jsonResponse(
      {
        error: timeout
          ? 'La IA local tardó demasiado en responder.'
          : 'No se pudo conectar con la IA local. ¿Sigue abierta la pestaña de Colab y la URL del túnel es la actual?',
      },
      503
    );
  }
}

/** Envía un payload estilo OpenAI al proveedor elegido y devuelve una Response estilo OpenAI. */
export async function aiFetch(payload: any): Promise<Response> {
  const cfg = getAiConfig();
  if (cfg.provider === 'local' && cfg.localUrl) return callLocal(cfg, payload);
  return fetch(OPENAI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(payload),
  });
}
