// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * PROXY PURO PARA OPENAI API
 * 
 * Esta función NO procesa nada, simplemente reenvía la petición a OpenAI
 * con el token seguro y devuelve la respuesta tal cual.
 * 
 * OBJETIVO: Ocultar el token de OpenAI, NADA MÁS.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('🔄 Proxy: Reenviando petición a OpenAI...');
    console.log('📦 Payload size:', JSON.stringify(payload).length, 'bytes');
    console.log('🔑 Model:', payload.model);
    console.log('💬 Messages count:', payload.messages?.length);

    // Hacer la llamada a OpenAI con el payload EXACTO
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: 'Error desconocido' } 
      }));
      console.error('❌ OpenAI error:', errorData);
      throw new Error(`Error OpenAI: ${errorData.error?.message || response.statusText}`);
    }

    // Obtener la respuesta EXACTA de OpenAI
    const result = await response.json();

    console.log('✅ Proxy: Respuesta de OpenAI recibida');
    console.log('📊 Response usage:', result.usage);
    console.log('🎯 Choices:', result.choices?.length);

    // Devolver la respuesta EXACTA sin modificar NADA
    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('❌ Error en proxy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
