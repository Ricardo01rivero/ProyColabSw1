import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/types/database.types';
import type { NodeType, EdgeType } from '../utils/umlConstants';
import {
  AI_AUTHOR,
  MAX_FILE_MB,
  askSeniorDev,
  clearChat,
  conversationOf,
  isAnalyzable,
  isImage,
  isVisibleTo,
  joinPresence,
  loadChatMessages,
  postChatMessage,
  subscribeToChat,
  uploadChatFile,
} from '../services/chatService';
import type { OnlineUser } from '../services/chatService';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  userName: string;
  isHost: boolean;
  nodes: NodeType[];
  edges: EdgeType[];
  onUnreadChange?: (count: number) => void;
  onOnlineChange?: (count: number) => void;
}

const GENERAL = 'general';
type View = 'chat' | 'people';

// Colores estables por persona (para distinguir quién escribe)
const PALETTE = ['#1565c0', '#2e7d32', '#ad1457', '#ef6c00', '#6a1b9a', '#00838f', '#4e342e'];
const colorFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

const initials = (name: string) =>
  name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Formato mínimo: bloques ```código```, `código`, **negrita** y saltos de línea. */
function renderRichText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  text.split(/```(?:\w+)?\n?/).forEach((block, i) => {
    if (i % 2 === 1) {
      nodes.push(
        <pre key={`pre${i}`} style={styles.pre}>
          {block.replace(/\n$/, '')}
        </pre>
      );
      return;
    }
    block.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((piece, j) => {
      const key = `${i}-${j}`;
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
        nodes.push(<strong key={key}>{piece.slice(2, -2)}</strong>);
      } else if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
        nodes.push(
          <code key={key} style={styles.code}>
            {piece.slice(1, -1)}
          </code>
        );
      } else if (piece) {
        nodes.push(<React.Fragment key={key}>{piece}</React.Fragment>);
      }
    });
  });
  return nodes;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  boardId,
  boardName,
  userName,
  isHost,
  nodes,
  edges,
  onUnreadChange,
  onOnlineChange,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [view, setView] = useState<View>('chat');
  const [activeConv, setActiveConv] = useState<string>(GENERAL);
  const [openedConvs, setOpenedConvs] = useState<string[]>([]);
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [askAI, setAskAI] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Refs para leer el estado actual dentro de los callbacks de tiempo real
  const isOpenRef = useRef(isOpen);
  const viewRef = useRef(view);
  const activeConvRef = useRef(activeConv);
  const messagesRef = useRef<ChatMessage[]>([]);
  const onlineRef = useRef<OnlineUser[]>([]);
  isOpenRef.current = isOpen;
  viewRef.current = view;
  activeConvRef.current = activeConv;
  messagesRef.current = messages;
  onlineRef.current = online;

  const isPrivate = activeConv !== GENERAL;

  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
  };

  // Historial + mensajes en tiempo real
  useEffect(() => {
    if (!boardId) return;
    let active = true;
    setMessages([]);
    setUnreadByConv({});
    setActiveConv(GENERAL);
    setOpenedConvs([]);
    setError(null);

    const reload = () =>
      loadChatMessages(boardId, userName)
        .then(msgs => active && setMessages(msgs))
        .catch(err => active && setError(err.message));

    reload();
    const unsubscribe = subscribeToChat(
      boardId,
      msg => {
        if (!active || !isVisibleTo(msg, userName)) return;
        const isNew = !messagesRef.current.some(m => m.id === msg.id);
        addMessage(msg);
        if (!isNew || msg.author === userName) return;
        const conv = conversationOf(msg, userName);
        const viewing = isOpenRef.current && viewRef.current === 'chat' && activeConvRef.current === conv;
        if (!viewing) setUnreadByConv(u => ({ ...u, [conv]: (u[conv] || 0) + 1 }));
      },
      reload
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [boardId, userName]);

  // Presencia: quién está conectado ahora
  useEffect(() => {
    if (!boardId) return;
    return joinPresence(boardId, { name: userName, mode: isHost ? 'host' : 'guest' }, setOnline);
  }, [boardId, userName, isHost]);

  // Al mirar una conversación, sus mensajes quedan leídos
  useEffect(() => {
    if (isOpen && view === 'chat') setUnreadByConv(u => (u[activeConv] ? { ...u, [activeConv]: 0 } : u));
  }, [isOpen, view, activeConv, messages]);

  const totalUnread = Object.values(unreadByConv).reduce((a, b) => a + b, 0);
  useEffect(() => onUnreadChange?.(totalUnread), [totalUnread, onUnreadChange]);
  useEffect(() => onOnlineChange?.(online.length), [online.length, onOnlineChange]);

  // Conversaciones privadas existentes (por mensajes o abiertas a mano)
  const privateConvs = useMemo(() => {
    const set = new Set(openedConvs);
    messages.forEach(m => m.recipient && set.add(conversationOf(m, userName)));
    return [...set];
  }, [messages, openedConvs, userName]);

  const convMessages = useMemo(
    () => messages.filter(m => conversationOf(m, userName) === activeConv),
    [messages, activeConv, userName]
  );

  // Integrantes: conectados ahora + quienes escribieron antes y ya no están
  const offlineMembers = useMemo(() => {
    const onlineNames = new Set(online.map(u => u.name));
    return [
      ...new Set(messages.filter(m => m.role === 'user' && !onlineNames.has(m.author)).map(m => m.author)),
    ];
  }, [messages, online]);

  // Bajar al último mensaje
  useEffect(() => {
    if (isOpen && view === 'chat' && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [convMessages, isOpen, view, aiThinking]);

  const openConversation = (conv: string) => {
    if (conv !== GENERAL && !openedConvs.includes(conv)) setOpenedConvs(c => [...c, conv]);
    setActiveConv(conv);
    setView('chat');
    setError(null);
  };

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`"${f.name}" pesa más de ${MAX_FILE_MB} MB`);
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleSend = async () => {
    const content = text.trim();
    if ((!content && !file) || sending) return;
    const useAI = askAI && !isPrivate;
    setSending(true);
    setError(null);
    try {
      const attachment = file ? await uploadChatFile(boardId, file) : null;
      const mine = await postChatMessage({
        boardId,
        author: userName,
        content,
        recipient: isPrivate ? activeConv : null,
        attachment,
      });
      addMessage(mine);
      setText('');
      setFile(null);
      if (useAI) {
        setAiThinking(true);
        const general = messagesRef.current.filter(m => !m.recipient);
        const history = general.some(m => m.id === mine.id) ? general : [...general, mine];
        const answer = await askSeniorDev({
          boardId,
          asker: userName,
          history,
          online: onlineRef.current.map(u => u.name),
          nodes,
          edges,
        });
        addMessage(answer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSending(false);
      setAiThinking(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('¿Borrar TODO el chat de esta pizarra (general y privados) para todos los usuarios?')) return;
    try {
      await clearChat(boardId);
      setMessages([]);
      setOpenedConvs([]);
      setActiveConv(GENERAL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!isOpen) return null;

  const tabs = [GENERAL, ...privateConvs];

  return (
    <aside style={styles.panel} aria-label="Chat del equipo con la IA">
      <header style={styles.header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💬 Chat del equipo + IA</div>
          <div style={styles.subtitle} title={boardName}>
            📋 {boardName} · tú: <strong>{userName}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setView(v => (v === 'people' ? 'chat' : 'people'))}
            style={{ ...styles.headerBtn, width: 'auto', padding: '0 10px', background: view === 'people' ? 'rgba(255,255,255,0.4)' : styles.headerBtn.background }}
            title="Ver integrantes y enviar mensajes privados"
          >
            👥 {online.length}
          </button>
          {isHost && (
            <button onClick={handleClear} style={styles.headerBtn} title="Borrar el chat de esta pizarra">
              🗑️
            </button>
          )}
          <button onClick={onClose} style={styles.headerBtn} title="Cerrar chat">
            ✕
          </button>
        </div>
      </header>

      {view === 'people' ? (
        <div style={styles.list}>
          <div style={styles.sectionTitle}>🟢 Conectados ahora ({online.length})</div>
          {online.map(u => {
            const isMe = u.name === userName;
            return (
              <button
                key={u.name}
                disabled={isMe}
                onClick={() => openConversation(u.name)}
                style={{ ...styles.person, cursor: isMe ? 'default' : 'pointer' }}
                title={isMe ? 'Eres tú' : `Enviar un mensaje privado a ${u.name}`}
              >
                <span style={{ ...styles.avatar, background: colorFor(u.name) }}>
                  {initials(u.name)}
                  <span style={styles.onlineDot} />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <strong>{u.name}</strong>
                  {isMe && ' (tú)'}
                  <br />
                  <span style={{ fontSize: 12, color: '#777' }}>
                    {u.mode === 'host' ? '🏠 Anfitrión' : '👤 Invitado'} · desde {formatTime(u.since)}
                    {u.tabs > 1 && ` · ${u.tabs} pestañas`}
                  </span>
                </span>
                {!isMe && <span style={styles.dmHint}>🔒 Privado</span>}
              </button>
            );
          })}

          {offlineMembers.length > 0 && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 8 }}>⚪ Participaron, desconectados ({offlineMembers.length})</div>
              {offlineMembers.map(name => (
                <button
                  key={name}
                  onClick={() => openConversation(name)}
                  style={{ ...styles.person, opacity: 0.7 }}
                  title={`Dejar un mensaje privado a ${name} (lo verá al volver)`}
                >
                  <span style={{ ...styles.avatar, background: '#9e9e9e' }}>{initials(name)}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <strong>{name}</strong>
                  </span>
                  <span style={styles.dmHint}>🔒 Privado</span>
                </button>
              ))}
            </>
          )}

          <div style={styles.note}>
            🤖 <strong>{AI_AUTHOR}</strong> participa solo en el chat general.
            <br />
            Los mensajes privados solo los ven las dos personas en la app.
          </div>
        </div>
      ) : (
        <>
          {/* Pestañas: General + conversaciones privadas */}
          <nav style={styles.tabs}>
            {tabs.map(conv => {
              const active = conv === activeConv;
              const unread = unreadByConv[conv] || 0;
              return (
                <button
                  key={conv}
                  onClick={() => openConversation(conv)}
                  style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
                >
                  {conv === GENERAL ? '🌐 General' : `🔒 ${conv}`}
                  {unread > 0 && !active && <span style={styles.tabBadge}>{unread}</span>}
                </button>
              );
            })}
          </nav>

          <div ref={listRef} style={styles.list}>
            {convMessages.length === 0 && !error && (
              <div style={styles.empty}>
                {isPrivate ? (
                  <>
                    Conversación privada con <strong>{activeConv}</strong>.
                    <br />
                    Solo ustedes dos verán estos mensajes.
                  </>
                ) : (
                  <>
                    Todavía no hay mensajes.
                    <br />
                    Pregúntale algo a la IA sobre el diagrama, por ejemplo:
                    <br />
                    <em>"¿Está bien la relación entre Cliente y Pedido?"</em>
                    <br />
                    También puedes adjuntar una foto o PDF 📎 para que la IA lo analice.
                  </>
                )}
              </div>
            )}

            {convMessages.map(m => {
              const isAI = m.role === 'assistant';
              const isMine = !isAI && m.author === userName;
              const color = isAI ? '#5e35b1' : colorFor(m.author);
              return (
                <div
                  key={m.id}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{ ...styles.meta, color }}>
                    {isAI ? `🤖 ${AI_AUTHOR}` : `👤 ${m.author}${isMine ? ' (tú)' : ''}`}
                    {isAI && m.reply_to_author && (
                      <span style={{ color: '#777', fontWeight: 400 }}> → responde a {m.reply_to_author}</span>
                    )}
                    <span style={styles.time}>{formatTime(m.created_at)}</span>
                  </div>
                  <div
                    style={{
                      ...styles.bubble,
                      background: isAI ? '#f3effc' : isMine ? '#e3f2fd' : '#f5f5f5',
                      borderLeft: isAI ? '3px solid #5e35b1' : `3px solid ${color}`,
                    }}
                  >
                    {m.attachment_url && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" style={styles.attachment}>
                        {isImage(m.attachment_type) ? (
                          <img src={m.attachment_url} alt={m.attachment_name || 'imagen'} style={styles.thumb} />
                        ) : (
                          <span>📄 {m.attachment_name || 'archivo'}</span>
                        )}
                      </a>
                    )}
                    {m.content && renderRichText(m.content)}
                  </div>
                </div>
              );
            })}

            {aiThinking && (
              <div style={{ ...styles.meta, color: '#5e35b1' }}>
                🤖 {AI_AUTHOR} está pensando la respuesta para {userName}…
              </div>
            )}
          </div>

          {error && <div style={styles.error}>⚠️ {error}</div>}

          <footer
            style={styles.footer}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            {file && (
              <div style={styles.fileChip}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isImage(file.type) ? '🖼️' : '📄'} {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  {!isPrivate && askAI && !isAnalyzable(file.type) && ' · la IA no puede leer este tipo, solo se compartirá'}
                </span>
                <button onClick={() => setFile(null)} style={styles.chipClose} title="Quitar archivo">
                  ✕
                </button>
              </div>
            )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onPaste={e => {
                const pasted = [...e.clipboardData.files][0];
                if (pasted) {
                  e.preventDefault();
                  pickFile(pasted);
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isPrivate
                  ? `Mensaje privado para ${activeConv}… (Enter envía)`
                  : askAI
                    ? `Pregúntale a la IA, ${userName}… (Enter envía)`
                    : 'Mensaje para el equipo… (Enter envía)'
              }
              rows={3}
              style={styles.textarea}
              disabled={sending}
            />
            <div style={styles.footerRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={e => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={styles.attachBtn}
                  title={`Adjuntar imagen, PDF u otro archivo (máx. ${MAX_FILE_MB} MB). También puedes pegar o arrastrar.`}
                  disabled={sending}
                >
                  📎
                </button>
                {isPrivate ? (
                  <span style={{ fontSize: 12, color: '#777' }}>🔒 La IA no participa en privados</span>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={askAI} onChange={e => setAskAI(e.target.checked)} />
                    🤖 Que responda la IA
                  </label>
                )}
              </div>
              <button onClick={handleSend} disabled={sending || (!text.trim() && !file)} style={styles.sendBtn}>
                {sending ? (aiThinking ? 'IA pensando…' : file ? 'Subiendo…' : 'Enviando…') : 'Enviar'}
              </button>
            </div>
          </footer>
        </>
      )}
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 400,
    maxWidth: '100vw',
    background: '#fff',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.2)',
    zIndex: 3500,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '12px 14px',
    color: '#fff',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  subtitle: { fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  headerBtn: {
    border: 'none',
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    borderRadius: 6,
    width: 32,
    height: 32,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: '6px 8px 0',
    borderBottom: '1px solid #e0e0e0',
    overflowX: 'auto',
    flexShrink: 0,
  },
  tab: {
    border: 'none',
    background: 'transparent',
    padding: '8px 10px',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    borderBottom: '3px solid transparent',
    color: '#555',
    position: 'relative',
  },
  tabActive: { borderBottom: '3px solid #5e35b1', color: '#5e35b1', fontWeight: 700 },
  tabBadge: {
    marginLeft: 6,
    background: '#e53935',
    color: '#fff',
    borderRadius: 10,
    fontSize: 11,
    padding: '1px 6px',
    fontWeight: 700,
  },
  list: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#555' },
  person: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    border: '1px solid #eee',
    borderRadius: 10,
    background: '#fafafa',
    padding: '8px 10px',
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  avatar: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: '50%',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: '50%',
    background: '#43a047',
    border: '2px solid #fff',
  },
  dmHint: { fontSize: 12, color: '#5e35b1', fontWeight: 600 },
  note: { fontSize: 12, color: '#777', lineHeight: 1.5, marginTop: 8, textAlign: 'center' },
  empty: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 1.6 },
  meta: { fontSize: 12, fontWeight: 700, marginBottom: 3 },
  time: { color: '#999', fontWeight: 400, marginLeft: 6 },
  bubble: {
    maxWidth: '92%',
    padding: '8px 11px',
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 1.45,
    color: '#222',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  attachment: { display: 'block', marginBottom: 6, color: '#1565c0', textDecoration: 'none', fontWeight: 600 },
  thumb: { maxWidth: '100%', maxHeight: 220, borderRadius: 6, display: 'block', border: '1px solid #ddd' },
  pre: {
    background: '#263238',
    color: '#eceff1',
    padding: 8,
    borderRadius: 6,
    fontSize: 12,
    overflowX: 'auto',
    whiteSpace: 'pre',
    margin: '6px 0',
  },
  code: { background: 'rgba(0,0,0,0.07)', padding: '1px 4px', borderRadius: 4, fontSize: 13 },
  error: { background: '#ffebee', color: '#c62828', fontSize: 13, padding: '8px 14px' },
  footer: { borderTop: '1px solid #eee', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    background: '#ede7f6',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
  },
  chipClose: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, flexShrink: 0 },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'none',
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    fontFamily: 'inherit',
  },
  footerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  attachBtn: {
    border: '1px solid #ccc',
    background: '#fff',
    borderRadius: 8,
    width: 36,
    height: 34,
    cursor: 'pointer',
    fontSize: 16,
  },
  sendBtn: {
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    background: '#5e35b1',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default ChatPanel;
