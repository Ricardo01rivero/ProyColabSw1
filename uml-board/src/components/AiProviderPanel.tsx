import React, { useState } from 'react';
import { getAiConfig, setAiConfig, testLocalAi, type AiProvider } from '../lib/aiClient';

/**
 * Selector del motor de IA: Nube (Gemini) o Local (modelo abierto con Ollama, p. ej. en Google Colab).
 * Afecta al asistente de prompt, a la importación desde imagen y al chat "IA Dev Senior".
 */
const AiProviderPanel: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const initial = getAiConfig();
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [url, setUrl] = useState(initial.localUrl);
  const [model, setModel] = useState(initial.localModel);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const probar = async () => {
    setTesting(true);
    setStatus(null);
    try {
      setStatus({ ok: true, text: `✅ ${await testLocalAi(url, model)}` });
    } catch (e) {
      setStatus({
        ok: false,
        text: `❌ ${e instanceof Error ? e.message : 'No responde'}. Revisa que Colab siga abierto y la URL del túnel.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const guardar = () => {
    if (provider === 'local' && !url.trim()) {
      setStatus({ ok: false, text: '❌ Escribe la URL del túnel (https://....trycloudflare.com)' });
      return;
    }
    setAiConfig({ provider, localUrl: url, localModel: model.trim() || 'qwen2.5vl:7b' });
    setStatus({ ok: true, text: '✅ Guardado. Se aplica al asistente, a importar imagen y al chat.' });
    setTimeout(() => onDone?.(), 900);
  };

  return (
    <div style={s.box}>
      <div style={s.title}>🤖 Motor de IA</div>
      <label style={s.option}>
        <input type="radio" checked={provider === 'nube'} onChange={() => setProvider('nube')} />
        <span>
          <strong>Nube · Gemini</strong>
          <br />
          <small>Más preciso con fotos. Requiere internet.</small>
        </span>
      </label>
      <label style={s.option}>
        <input type="radio" checked={provider === 'local'} onChange={() => setProvider('local')} />
        <span>
          <strong>Local · modelo abierto (Ollama)</strong>
          <br />
          <small>Corre en tu propio servidor (Google Colab con GPU). Sin claves ni datos a terceros.</small>
        </span>
      </label>

      {provider === 'local' && (
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          <input
            style={s.input}
            placeholder="https://xxxx.trycloudflare.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <input style={s.input} placeholder="qwen2.5vl:7b" value={model} onChange={e => setModel(e.target.value)} />
          <button style={s.secondary} onClick={probar} disabled={testing || !url.trim()}>
            {testing ? 'Probando…' : 'Probar conexión'}
          </button>
        </div>
      )}

      {status && <div style={{ ...s.status, color: status.ok ? '#1b5e20' : '#b71c1c' }}>{status.text}</div>}

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button style={s.primary} onClick={guardar}>
          Guardar
        </button>
        <button style={s.secondary} onClick={onDone}>
          Cerrar
        </button>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  box: { padding: 12, borderBottom: '1px solid #e0e0e0', background: '#f7f5ff', fontSize: 13 },
  title: { fontWeight: 700, marginBottom: 6 },
  option: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', cursor: 'pointer' },
  input: { padding: '6px 8px', border: '1px solid #c5c0e8', borderRadius: 6, fontSize: 13 },
  primary: {
    flex: 1,
    padding: '7px 10px',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    cursor: 'pointer',
    fontWeight: 600,
  },
  secondary: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #c5c0e8',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  },
  status: { marginTop: 6, fontSize: 12 },
};

export default AiProviderPanel;
