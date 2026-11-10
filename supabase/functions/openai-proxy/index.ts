// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

/**
 * PROXY DE IA (oculta el token, NADA MÁS)
 *
 * La app envía peticiones en formato OpenAI (chat/completions) y recibe
 * respuestas en ese mismo formato. Según el secreto configurado en Supabase:
 *   - GEMINI_API_KEY  -> usa Google Gemini (capa gratuita, API nativa generateContent)
 *   - OPENAI_API_KEY  -> usa OpenAI
 * Si existen las dos, se usa Gemini.
 * Opcional: GEMINI_MODEL para cambiar el modelo sin tocar el código.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'; // 3.8-flash se cuelga en la capa gratuita (probado 09/11/2026)
// Supabase corta las funciones a los 150 s: el total de intentos se queda por debajo
const TIMEOUT_MS = 130_000;
const ATTEMPT_TIMEOUT_MS = 50_000;
// Modelos de respaldo si el principal está saturado (ambos probados el 09/11/2026)
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Descarga una imagen (o lee un data:URL) y la devuelve como base64 para Gemini
async function toInlineData(url: string) {
  if (url.startsWith('data:')) {
    const [meta, data] = url.split(',');
    return { mime_type: meta.slice(5).split(';')[0] || 'image/png', data };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`);
  const mime = res.headers.get('content-type') || 'image/png';
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { mime_type: mime, data: btoa(binary) };
}

// deno-lint-ignore no-explicit-any
async function toGeminiParts(content: any) {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? '') }];
  return await Promise.all(
    // deno-lint-ignore no-explicit-any
    content.map(async (part: any) =>
      part.type === 'image_url'
        ? { inline_data: await toInlineData(part.image_url.url) }
        : { text: part.text ?? '' }
    )
  );
}

// Diagnóstico: lista los modelos Gemini disponibles para la clave (no expone la clave)
async function listGeminiModels() {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': GEMINI_API_KEY! },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error?.message || res.statusText };
  return {
    modeloActual: GEMINI_MODEL,
    modelos: (data.models || [])
      // deno-lint-ignore no-explicit-any
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      // deno-lint-ignore no-explicit-any
      .map((m: any) => m.name.replace('models/', '')),
  };
}

// Petición formato OpenAI -> Gemini generateContent -> respuesta formato OpenAI
// deno-lint-ignore no-explicit-any
async function callGemini(payload: any, model = GEMINI_MODEL) {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = payload.messages || [];
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n\n');

  const contents = await Promise.all(
    messages
      .filter(m => m.role !== 'system')
      .map(async m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: await toGeminiParts(m.content),
      }))
  );

  const body = {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
    generationConfig: {
      temperature: payload.temperature ?? 0.2,
      // Los modelos nuevos "piensan" y eso consume tokens de salida: se deja margen extra
      maxOutputTokens: (payload.max_tokens || 2000) + 8000,
    },
  };

  // Gemini gratuito a veces responde "ocupado" (429/503) o tarda demasiado:
  // se reintenta y, si sigue fallando, se prueba con modelos de respaldo.
  const modelos = [...new Set([model, ...FALLBACK_MODELS])];
  const inicio = Date.now();
  let ultimoError = 'Error desconocido';
  // deno-lint-ignore no-explicit-any
  let result: any = null;

  for (const [intento, m] of modelos.entries()) {
    const restante = TIMEOUT_MS - (Date.now() - inicio);
    if (restante < 5_000) break;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, restante)),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (intento > 0) console.log(`↪️ Respondió el modelo de respaldo ${m}`);
        result = { ...data, _model: m };
        break;
      }
      ultimoError = `Gemini ${response.status} (${m}): ${data.error?.message || response.statusText}`;
      console.error('❌', ultimoError);
      // Errores que no se arreglan reintentando (petición mal formada, clave inválida...)
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (e) {
      ultimoError = e instanceof DOMException && e.name === 'TimeoutError'
        ? `El modelo ${m} no respondió a tiempo`
        : `Fallo de red con ${m}: ${e instanceof Error ? e.message : e}`;
      console.error('❌', ultimoError);
    }
    await new Promise(r => setTimeout(r, 1_000));
  }

  if (!result) throw new Error(`La IA está ocupada o no respondió. Intenta de nuevo. (${ultimoError})`);
  model = result._model;

  const candidate = result.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => p.text && !p.thought)
    // deno-lint-ignore no-explicit-any
    .map((p: any) => p.text)
    .join('');

  if (!text) {
    console.error('⚠️ Gemini sin texto:', JSON.stringify(result));
    throw new Error(`Gemini no devolvió texto (motivo: ${candidate?.finishReason || 'desconocido'})`);
  }

  return {
    id: result.responseId || crypto.randomUUID(),
    object: 'chat.completion',
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: result.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: result.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

// deno-lint-ignore no-explicit-any
async function callOpenAI(payload: any) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('❌ Error de OpenAI:', JSON.stringify(result));
    throw new Error(`Error IA (OpenAI ${response.status}): ${result.error?.message || response.statusText}`);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Modelo Gemini a probar sin redesplegar: .../openai-proxy?model=nombre-del-modelo
  const testModel = new URL(req.url).searchParams.get('model') || GEMINI_MODEL;

  try {
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return json({ error: 'Falta configurar GEMINI_API_KEY u OPENAI_API_KEY en Supabase' }, 500);
    }

    // GET = diagnóstico: qué modelos de Gemini puede usar la clave
    if (req.method === 'GET') {
      return json(GEMINI_API_KEY ? await listGeminiModels() : { proveedor: 'OpenAI' });
    }

    const payload = await req.json();
    const inicio = Date.now();
    console.log(`🔄 Proxy -> ${GEMINI_API_KEY ? 'Gemini ' + testModel : 'OpenAI ' + payload.model}`);
    const result = GEMINI_API_KEY ? await callGemini(payload, testModel) : await callOpenAI(payload);
    console.log(`✅ Respuesta de ${result.model} en ${Date.now() - inicio} ms`, JSON.stringify(result.usage ?? {}));

    return json(result);
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    const message = isTimeout
      ? `La IA no respondió en ${TIMEOUT_MS / 1000} s (modelo ${testModel})`
      : error instanceof Error ? error.message : 'Error desconocido';
    console.error('❌ Error en proxy:', message);
    return json({ error: message }, isTimeout ? 504 : 500);
  }
});
