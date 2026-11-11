/**
 * Chat compartido de la pizarra + IA "desarrollador senior" (2do parcial).
 *
 * - Los mensajes se guardan en la tabla chat_messages de Supabase y llegan a
 *   todos los usuarios de la pizarra en tiempo real (postgres_changes).
 * - Chat general (recipient = null) con la IA, y mensajes privados entre
 *   personas (recipient = nombre del destinatario).
 * - Archivos adjuntos en el bucket "chat-archivos". La IA analiza imágenes y PDF
 *   solo si se le pregunta; si no, el archivo solo se comparte con el equipo.
 * - Presencia en línea (Supabase Realtime Presence): quién está conectado ahora.
 * - Cuando alguien pregunta a la IA, su navegador llama al proxy de IA y guarda
 *   la respuesta en la tabla, así todos la ven. La IA recibe quién pregunta,
 *   el historial con nombres y el diagrama actual.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.config';
import { aiFetch } from '../lib/aiClient';
import type { ChatMessage } from '../lib/types/database.types';
import type { NodeType, EdgeType } from '../utils/umlConstants';

export const AI_AUTHOR = 'IA Dev Senior';
export const MAX_FILE_MB = 10;
const CHAT_BUCKET = 'chat-archivos';
const HISTORY_LIMIT = 500;
const CONTEXT_MESSAGES = 20;

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Un mensaje es visible si es del chat general o si el usuario es autor o destinatario. */
export const isVisibleTo = (m: ChatMessage, me: string) =>
  !m.recipient || m.author === me || m.recipient === me;

/** Clave de conversación: 'general' o el nombre de la otra persona del privado. */
export const conversationOf = (m: ChatMessage, me: string) =>
  !m.recipient ? 'general' : m.author === me ? m.recipient : m.author;

export async function loadChatMessages(boardId: string, me: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(`No se pudo cargar el chat: ${error.message}`);
  return (data || []).filter(m => isVisibleTo(m, me));
}

export function subscribeToChat(
  boardId: string,
  onInsert: (msg: ChatMessage) => void,
  onDelete: () => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat_${boardId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `board_id=eq.${boardId}` },
      payload => onInsert(payload.new as ChatMessage)
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, () => onDelete())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export interface Attachment {
  url: string;
  name: string;
  type: string;
}

export async function postChatMessage(params: {
  boardId: string;
  author: string;
  content: string;
  role?: 'user' | 'assistant';
  replyToAuthor?: string | null;
  recipient?: string | null;
  attachment?: Attachment | null;
}): Promise<ChatMessage> {
  const { boardId, author, content, role = 'user', replyToAuthor = null, recipient = null, attachment } = params;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      board_id: boardId,
      author,
      role,
      content,
      reply_to_author: replyToAuthor,
      recipient,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_type: attachment?.type ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`No se pudo enviar el mensaje: ${error?.message}`);
  return data;
}

export async function clearChat(boardId: string): Promise<void> {
  const { error } = await supabase.from('chat_messages').delete().eq('board_id', boardId);
  if (error) throw new Error(`No se pudo limpiar el chat: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Archivos adjuntos
// ---------------------------------------------------------------------------

export const isImage = (type?: string | null) => Boolean(type?.startsWith('image/'));
/** Tipos que la IA (Gemini) puede leer directamente. */
export const isAnalyzable = (type?: string | null) => isImage(type) || type === 'application/pdf';

export async function uploadChatFile(boardId: string, file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`El archivo pesa más de ${MAX_FILE_MB} MB`);
  }
  const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${boardId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  const { data } = supabase.storage.from(CHAT_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: file.type || 'application/octet-stream' };
}

// ---------------------------------------------------------------------------
// Presencia: quién está conectado ahora en la pizarra
// ---------------------------------------------------------------------------

export interface OnlineUser {
  name: string;
  mode: 'host' | 'guest';
  since: string;
  tabs: number;
}

export function joinPresence(
  boardId: string,
  me: { name: string; mode: 'host' | 'guest' },
  onChange: (users: OnlineUser[]) => void
): () => void {
  const tabKey = `${me.name}::${Math.random().toString(36).slice(2)}`;
  const channel = supabase.channel(`presence_${boardId}`, { config: { presence: { key: tabKey } } });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ name: string; mode: 'host' | 'guest'; since: string }>();
      const byName = new Map<string, OnlineUser>();
      Object.values(state).flat().forEach(p => {
        const prev = byName.get(p.name);
        byName.set(p.name, {
          name: p.name,
          mode: prev?.mode === 'host' || p.mode === 'host' ? 'host' : 'guest',
          since: prev && prev.since < p.since ? prev.since : p.since,
          tabs: (prev?.tabs || 0) + 1,
        });
      });
      onChange([...byName.values()].sort((a, b) => a.since.localeCompare(b.since)));
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: me.name, mode: me.mode, since: new Date().toISOString() });
      }
    });

  return () => {
    channel.untrack();
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// IA "desarrollador senior"
// ---------------------------------------------------------------------------

/** Resumen legible del diagrama actual para dárselo a la IA como contexto. */
export function describeDiagram(nodes: NodeType[], edges: EdgeType[]): string {
  if (nodes.length === 0) return 'El diagrama está vacío (todavía no hay clases).';
  const nameOf = (id: string) => nodes.find(n => n.id === id)?.label || id;

  const classes = nodes
    .map(n => {
      const attrs = (n.attributes || []).map(a => `${a.name}: ${a.datatype}`).join(', ');
      const extra = n.asociativa ? ' [tabla intermedia muchos a muchos]' : '';
      return `- ${n.label}${extra}${attrs ? ` (${attrs})` : ' (sin atributos)'}`;
    })
    .join('\n');

  const relations = edges.length
    ? edges
        .map(
          e =>
            `- ${nameOf(e.source)} [${e.multiplicidadOrigen}] --${e.tipo}--> [${e.multiplicidadDestino}] ${nameOf(e.target)}`
        )
        .join('\n')
    : '- (sin relaciones)';

  return `Clases:\n${classes}\n\nRelaciones:\n${relations}`;
}

function buildSystemPrompt(asker: string, participants: string[], online: string[], diagram: string): string {
  const otros = participants.filter(p => p !== asker);
  return `Eres "${AI_AUTHOR}", un desarrollador senior más dentro de un equipo que diseña en tiempo real un modelo de datos (diagrama de clases UML) en una pizarra colaborativa. El sistema luego genera un backend Spring Boot con JPA y PostgreSQL y una app móvil Flutter.

Varias personas, desde distintos lugares, comparten este mismo chat y todas ven tus respuestas.
Participantes que han escrito en el chat: ${participants.join(', ') || asker}.
Conectados ahora en la pizarra: ${online.join(', ') || asker}.
Quien te pregunta AHORA es: ${asker}.

REGLAS OBLIGATORIAS:
1. Empieza SIEMPRE tu respuesta dirigiéndote a ${asker} por su nombre (por ejemplo: "${asker}, ...").
2. Nunca respondas de forma genérica: responde a lo que ${asker} preguntó, apoyándote en el diagrama actual (nombra clases, atributos y relaciones concretas).
3. Si la pregunta continúa algo que dijo otra persona del chat${otros.length ? ` (${otros.join(', ')})` : ''}, menciónala por su nombre (por ejemplo: "como comentó María...").
4. Habla como un colega senior: directo, práctico y con criterio técnico (normalización, cardinalidades, claves, tablas intermedias, buenas prácticas JPA/REST). Si algo del diagrama está mal o se puede mejorar, dilo y explica por qué.
5. Responde en español, breve (máximo ~200 palabras salvo que pidan detalle). Puedes usar listas y bloques de código.
6. Tú solo aconsejas en el chat; no modificas el diagrama. Si sugieren un cambio, explica cómo hacerlo (o que usen el "Asistente UML").
7. Si ${asker} adjunta una imagen o PDF, analízalo y relaciónalo con el diagrama (por ejemplo, compara un diagrama dibujado con el de la pizarra).

CÓMO FUNCIONA EL GENERADOR DE ESTE SISTEMA (tenlo en cuenta, no recomiendes lo que ya hace solo):
- Si una clase no tiene atributo id, el backend agrega automáticamente "id: Long" autoincremental (@Id, IDENTITY).
- Las relaciones generan las claves foráneas; las de muchos a muchos se resuelven con una clase intermedia (botón "Muchos a Muchos").
- Tipos disponibles para atributos: Integer, Float, Boolean, Date, String.

DIAGRAMA ACTUAL DE LA PIZARRA:
${diagram}`;
}

/**
 * Pide a la IA que responda la última pregunta de `asker` (chat general) y
 * guarda la respuesta en el chat (todos la reciben por tiempo real).
 * `history` debe ser solo el chat general e incluir ya la pregunta.
 */
export async function askSeniorDev(params: {
  boardId: string;
  asker: string;
  history: ChatMessage[];
  online: string[];
  nodes: NodeType[];
  edges: EdgeType[];
}): Promise<ChatMessage> {
  const { boardId, asker, history, online, nodes, edges } = params;

  const participants = [...new Set(history.filter(m => m.role === 'user').map(m => m.author))];
  if (!participants.includes(asker)) participants.push(asker);

  const recent = history.slice(-CONTEXT_MESSAGES);
  const lastIndex = recent.length - 1;

  // Cada mensaje humano lleva el nombre de su autor; solo el adjunto de la pregunta
  // actual se envía a la IA (los anteriores se mencionan por nombre, para no reenviarlos).
  const messages = recent.map((m, i) => {
    if (m.role === 'assistant') return { role: 'assistant', content: m.content };
    const fileNote = m.attachment_name ? ` [adjuntó el archivo "${m.attachment_name}"]` : '';
    const text = `[${m.author}]: ${m.content || '(sin texto)'}${fileNote}`;
    if (i === lastIndex && m.attachment_url && isAnalyzable(m.attachment_type)) {
      return {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: m.attachment_url } },
        ],
      };
    }
    return { role: 'user', content: text };
  });

  const payload = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt(asker, participants, online, describeDiagram(nodes, edges)) },
      ...messages,
    ],
    temperature: 0.4,
    max_tokens: 1200,
  };

  // Nube (Gemini vía proxy) o IA local (Ollama en Colab) según el selector del chat
  const response = await aiFetch(payload);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
    const detalle = typeof errorData.error === 'string' ? errorData.error : errorData.error?.message;
    throw new Error(`Error IA: ${detalle || response.statusText || response.status}`);
  }

  const result = await response.json();
  let content: string = result.choices?.[0]?.message?.content?.trim() || '';
  if (!content) throw new Error('La IA no devolvió respuesta');

  // Garantía extra: si la IA olvidó nombrar a quien preguntó, se antepone el nombre
  if (!content.toLowerCase().includes(asker.toLowerCase())) {
    content = `${asker}, ${content.charAt(0).toLowerCase()}${content.slice(1)}`;
  }

  return postChatMessage({ boardId, author: AI_AUTHOR, content, role: 'assistant', replyToAuthor: asker });
}
