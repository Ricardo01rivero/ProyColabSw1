/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from 'react';
import './StylesUmlPrompt.css';
import { processUMLPrompt } from '../services/aiPromptService';
import type { DiagramAction } from '../services/aiPromptService';
import type { NodeType, EdgeType } from '../utils/umlConstants';
import { computeLayout } from '../utils/layoutUtils';
import type { LayoutType } from '../utils/layoutUtils';

interface UmlPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNode: (node: NodeType) => Promise<void>;
  onCreateEdge: (edge: EdgeType) => Promise<void>;
  onUpdateNode: (nodeId: string, updates: Partial<NodeType>) => Promise<void>;
  onUpdateEdge: (edgeId: string, updates: Partial<EdgeType>) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onDeleteEdge: (edgeId: string) => Promise<void>;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  existingNodes: NodeType[];
  existingEdges: EdgeType[];
}

const UmlPrompt: React.FC<UmlPromptProps> = ({
  isOpen,
  onClose,
  onCreateNode,
  onCreateEdge,
  onUpdateNode,
  onDeleteNode,
  onDeleteEdge,
  onMoveNode,
  existingNodes,
  existingEdges,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finalTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);

  // Inicializar Web Speech API solo una vez
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.warn('⚠️ Web Speech API no disponible en este navegador');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'es-ES';

    recognitionRef.current.onstart = () => {
      console.log('🎤 Reconocimiento iniciado - ONSTART');
      isListeningRef.current = true;
    };

    recognitionRef.current.onresult = (event: any) => {
      console.log('📝 Evento onresult disparado - Total results:', event.results.length, 'ResultIndex:', event.resultIndex);
      let interimTranscript = '';
      let finalTranscript = '';

      // IMPORTANTE: Solo procesar desde resultIndex para evitar duplicados
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        console.log(`Resultado ${i}:`, transcript, 'isFinal:', event.results[i].isFinal);
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          console.log('✅ Agregando transcripción final:', transcript);
        } else {
          interimTranscript += transcript;
          console.log('⏳ Transcripción interim:', transcript);
        }
      }

      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
        console.log('📝 Acumulado total:', finalTranscriptRef.current);
      }

      const fullText = finalTranscriptRef.current + interimTranscript;
      console.log('✍️ Texto completo mostrado:', fullText);
      setPrompt(fullText);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('❌ Error en reconocimiento de voz:', event.error, event);
      if (event.error === 'no-speech') {
        console.log('⚠️ No se detectó voz, el reconocimiento se reiniciará automáticamente');
        // No detenemos, dejamos que se reinicie solo
      } else if (event.error === 'not-allowed') {
        isListeningRef.current = false;
        setIsListening(false);
        setError('❌ Permiso de micrófono denegado. Por favor, permite el acceso al micrófono.');
      } else if (event.error === 'aborted') {
        console.log('⚠️ Reconocimiento abortado, reiniciando...');
      } else if (event.error === 'network' || event.error === 'service-not-allowed') {
        // El dictado usa los servidores de Google: solo funciona en Chrome o Edge con internet
        isListeningRef.current = false;
        setIsListening(false);
        setError(
          '❌ El dictado por voz no está disponible en este navegador. Abre la app en Google Chrome o Microsoft Edge (con internet).'
        );
      } else {
        isListeningRef.current = false;
        setIsListening(false);
        setError(`Error en reconocimiento de voz: ${event.error}`);
      }
    };

    recognitionRef.current.onend = () => {
      console.log('⏹️ Reconocimiento finalizado - isListeningRef:', isListeningRef.current);
      if (isListeningRef.current) {
        try {
          console.log('🔄 Reiniciando reconocimiento automáticamente...');
          recognitionRef.current.start();
        } catch (err) {
          console.error('❌ No se pudo reiniciar:', err);
          isListeningRef.current = false;
          setIsListening(false);
        }
      }
    };

    return () => {
      console.log('🧹 Limpiando reconocimiento de voz');
      if (recognitionRef.current) {
        try {
          isListeningRef.current = false;
          recognitionRef.current.stop();
        } catch (err) {
          console.log('Ya estaba detenido');
        }
      }
    };
  }, []); // Sin dependencias - se inicializa solo una vez

  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) {
      setError('❌ Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    if (isListening) {
      console.log('🛑 Deteniendo reconocimiento de voz');
      isListeningRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Error deteniendo:', err);
      }
    } else {
      console.log('▶️ Iniciando reconocimiento de voz - prompt actual:', prompt);
      setError(null);
      finalTranscriptRef.current = prompt; // Mantener texto existente
      isListeningRef.current = true;
      setIsListening(true);
      
      try {
        recognitionRef.current.start();
        console.log('✅ Start() ejecutado exitosamente');
      } catch (error) {
        console.error('❌ Error iniciando reconocimiento:', error);
        isListeningRef.current = false;
        setIsListening(false);
        setError('Error al iniciar el reconocimiento de voz. Verifica los permisos del micrófono.');
      }
    }
  };

  const executeActions = async (actions: DiagramAction[]) => {
    // Separar acciones: primero crear clases, luego relaciones
    const createClassActions = actions.filter(a => a.type === 'create' && a.target === 'class');
    const otherActions = actions.filter(a => !(a.type === 'create' && a.target === 'class'));
    
    // Mapa para almacenar las clases recién creadas
    const newlyCreatedClasses = new Map<string, string>(); // label -> id

    // Fase 1: Crear todas las clases primero
    for (const action of createClassActions) {
      try {
        const newNode: NodeType = {
          id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          label: action.data.label || 'NuevaClase',
          x: 200 + Math.random() * 300,
          y: 200 + Math.random() * 300,
          attributes: action.data.attributes || [],
          asociativa: action.data.asociativa || false,
          relaciona: action.data.relaciona || undefined,
        };
        await onCreateNode(newNode);
        newlyCreatedClasses.set(newNode.label, newNode.id);
        console.log('✅ Clase creada:', newNode.label, 'asociativa:', newNode.asociativa);
        await new Promise(resolve => setTimeout(resolve, 100)); // Esperar 100ms
      } catch (err) {
        console.error('❌ Error creando clase:', action, err);
      }
    }

    // Fase 2: Ejecutar otras acciones (atributos, relaciones, etc.)
    for (const action of otherActions) {
      try {
        if (action.type === 'create' && action.target === 'attribute') {
          const targetNode = existingNodes.find(n => n.id === action.data.classId);
          if (targetNode) {
            const newAttributes = [
              ...(targetNode.attributes || []),
              {
                name: action.data.name,
                datatype: action.data.datatype as 'String' | 'Integer' | 'Float' | 'Boolean' | 'Date',
                scope: action.data.scope as 'public' | 'private' | 'protected',
              },
            ];
            // 🔴 IMPORTANTE: Preservar el label para evitar que se resetee a "Class"
            await onUpdateNode(targetNode.id, { 
              label: targetNode.label,
              attributes: newAttributes 
            });
            console.log('✅ Atributo agregado a:', targetNode.label);
          }
        } 
        else if (action.type === 'create' && action.target === 'edge') {
          // Buscar en nodos existentes O en los recién creados
          let sourceNode = existingNodes.find(n => n.label === action.data.sourceLabel);
          let targetNode = existingNodes.find(n => n.label === action.data.targetLabel);
          
          // Si no los encuentra en existentes, buscar en recién creados
          if (!sourceNode && newlyCreatedClasses.has(action.data.sourceLabel)) {
            sourceNode = { 
              id: newlyCreatedClasses.get(action.data.sourceLabel)!, 
              label: action.data.sourceLabel 
            } as NodeType;
          }
          
          if (!targetNode && newlyCreatedClasses.has(action.data.targetLabel)) {
            targetNode = { 
              id: newlyCreatedClasses.get(action.data.targetLabel)!, 
              label: action.data.targetLabel 
            } as NodeType;
          }
          
          if (sourceNode && targetNode) {
            const newEdge: EdgeType = {
              id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              source: sourceNode.id,
              target: targetNode.id,
              tipo: action.data.tipo || 'asociacion',
              multiplicidadOrigen: action.data.multiplicidadOrigen || '1',
              multiplicidadDestino: action.data.multiplicidadDestino || '*',
            };
            await onCreateEdge(newEdge);
            console.log(`✅ Relación creada: ${sourceNode.label} → ${targetNode.label}`);
          } else {
            console.warn(`⚠️ No se encontraron las clases: ${action.data.sourceLabel} o ${action.data.targetLabel}`);
          }
        } 
        else if (action.type === 'move' && action.target === 'class') {
          const nodeToMove = existingNodes.find(n =>
            n.id === action.data.id || n.label === action.data.label
          );
          if (nodeToMove) {
            const hasAbs = typeof action.data.x === 'number' && typeof action.data.y === 'number';
            const newX = hasAbs ? action.data.x : nodeToMove.x + (Number(action.data.dx) || 0);
            const newY = hasAbs ? action.data.y : nodeToMove.y + (Number(action.data.dy) || 0);
            onMoveNode(nodeToMove.id, Math.round(newX), Math.round(newY));
            console.log('📍 Clase movida:', nodeToMove.label, '→', newX, newY);
          } else {
            console.warn('⚠️ Clase no encontrada para mover:', action.data);
          }
        }
        else if (action.type === 'arrange' && action.target === 'diagram') {
          const layouts: LayoutType[] = ['grid', 'row', 'column', 'circle', 'hierarchy'];
          const layout: LayoutType = layouts.includes(action.data?.layout)
            ? action.data.layout
            : 'grid';
          computeLayout(layout, existingNodes, existingEdges).forEach(p =>
            onMoveNode(p.id, p.x, p.y)
          );
          console.log('🧩 Diagrama ordenado con layout:', layout);
        }
        else if (action.type === 'update' && action.target === 'class') {
          await onUpdateNode(action.data.id, action.data);
          console.log('✅ Clase actualizada:', action.data.id);
        } 
        else if (action.type === 'delete' && action.target === 'class') {
          // Buscar clase por label o id
          const nodeToDelete = existingNodes.find(n => 
            n.id === action.data.id || n.label === action.data.label
          );
          if (nodeToDelete) {
            await onDeleteNode(nodeToDelete.id);
            console.log('🗑️ Clase eliminada:', nodeToDelete.label);
          } else {
            console.warn('⚠️ Clase no encontrada para eliminar:', action.data);
          }
        }
        else if (action.type === 'delete' && action.target === 'attribute') {
          // Eliminar atributo de una clase
          const targetNode = existingNodes.find(n => 
            n.id === action.data.classId || n.label === action.data.className
          );
          if (targetNode) {
            const newAttributes = (targetNode.attributes || []).filter(attr => 
              attr.name !== action.data.attributeName
            );
            // 🔴 IMPORTANTE: Preservar el label para evitar que se resetee a "Class"
            await onUpdateNode(targetNode.id, { 
              label: targetNode.label,
              attributes: newAttributes 
            });
            console.log('🗑️ Atributo eliminado:', action.data.attributeName, 'de', targetNode.label);
          } else {
            console.warn('⚠️ Clase no encontrada para eliminar atributo:', action.data);
          }
        }
        else if (action.type === 'delete' && action.target === 'edge') {
          // Buscar relación por labels o id
          const edgeToDelete = existingEdges.find(e => 
            e.id === action.data.id || 
            (action.data.sourceLabel && action.data.targetLabel && 
             existingNodes.find(n => n.id === e.source)?.label === action.data.sourceLabel &&
             existingNodes.find(n => n.id === e.target)?.label === action.data.targetLabel)
          );
          if (edgeToDelete) {
            await onDeleteEdge(edgeToDelete.id);
            console.log('🗑️ Relación eliminada:', edgeToDelete.id);
          } else {
            console.warn('⚠️ Relación no encontrada para eliminar:', action.data);
          }
        }
      } catch (err) {
        console.error('❌ Error ejecutando acción:', action, err);
      }
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    // Detener grabación si está activa
    if (isListening) {
      console.log('🛑 Deteniendo reconocimiento antes de enviar');
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current.stop();
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log('🚀 Procesando prompt:', prompt);
      const actions = await processUMLPrompt(prompt, existingNodes, existingEdges);
      console.log('📋 Acciones a ejecutar:', actions);
      
      await executeActions(actions);
      
      setPrompt('');
      finalTranscriptRef.current = '';
      onClose();
      console.log('✅ Proceso completado exitosamente');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="uml-prompt-overlay" 
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div 
        className="uml-prompt-modal" 
        onClick={e => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="uml-prompt-content">
          <div className="uml-prompt-header">
            <h2 className="uml-prompt-title">✨ Asistente UML Inteligente</h2>
            <button className="uml-prompt-close" onClick={onClose}>
              ×
            </button>
          </div>

          <p className="uml-prompt-description">
            Describe en tus propias palabras qué quieres hacer con tu diagrama. La IA interpretará
            tu solicitud mijooo
          </p>

          <textarea
            ref={textareaRef}
            className="uml-prompt-textarea"
            placeholder="Podes poner algo asi: 'Crea una clase Producto con atributos nombre tipo String, precio tipo Float y stock tipo Integer. Luego haz que Producto tenga una relación de composición con Categoría.'"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />

          {error && (
            <div style={{ 
              color: '#e53e3e', 
              marginTop: '15px', 
              padding: '12px', 
              background: '#fff5f5', 
              borderRadius: '8px',
              fontSize: '14px',
            }}>
              ⚠️ {error}
            </div>
          )}

          {isProcessing && (
            <div className="uml-prompt-loading">
              <div className="uml-prompt-spinner" />
              <span>Procesando tu solicitud con IA...</span>
            </div>
          )}

          <div className="uml-prompt-footer">
            <button
              className="uml-prompt-button uml-prompt-button-cancel"
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancelar
            </button>
            
            <button
              className={`uml-prompt-button uml-prompt-button-voice ${isListening ? 'listening' : ''}`}
              onClick={toggleVoiceRecognition}
              disabled={isProcessing}
              title={isListening ? 'Detener grabación' : 'Iniciar dictado por voz'}
            >
              {isListening ? '🎤 Grabando...' : '🎤 Dictar'}
            </button>

            <button
              className="uml-prompt-button uml-prompt-button-submit"
              onClick={handleSubmit}
              disabled={isProcessing || !prompt.trim()}
            >
              {isProcessing ? 'Procesando...' : '✨ Procesar (Ctrl+Enter)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UmlPrompt;
