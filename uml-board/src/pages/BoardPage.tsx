/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useCallback } from 'react';

import EdgeLayer from '../components/EdgeLayer';
import Node from '../components/Node';
import { useBoards } from '../hooks/useDiagramSync';
import { supabase } from '../lib/supabase.config';
import { importDiagramFromImage } from '../services/diagramImportService';
import { useClassStore } from '../store/classStore';
import { generarBackend } from '../utils/backendGenerator';
import { importFromJSON, exportToJSON } from '../utils/diagramImporter';
import { generarFrontend } from '../utils/frontendGenerator';
import type { NodeChange, EdgeChange } from 'reactflow';
import type { NodeType, EdgeType } from '../utils/umlConstants';
import { NODE_WIDTH, NODE_HEIGHT, calculateNodeHeight } from '../utils/umlConstants';
//estos son parte del asistente uml
import UmlPrompt from './UmlPrompt';
// Chat compartido con la IA "dev senior" (2do parcial)
import ChatPanel from '../components/ChatPanel';
import ErView from '../components/ErView';
import { exportarSql } from '../utils/sqlGenerator';
import { clearCurrentUserName, getCurrentUserName } from '../lib/currentUser';
import './StylesUmlPrompt.css';

// Tipos para datos de Supabase
type SupabaseNodeData = {
  label?: string;
  attributes?: Array<{
    name: string;
    scope: 'public' | 'private' | 'protected';
    type: string;
  }>;
  x?: number;
  y?: number;
  asociativa?: boolean;
  relaciona?: [string, string];
};

type SupabaseNode = {
  id: string;
  data?: SupabaseNodeData;
  position?: { x: number; y: number };
};

type ReactFlowEdge = {
  id: string;
  source: string;
  target: string;
  data?: {
    edgeType?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
  };
};

type SupabaseEdgeOutput = {
  id: string;
  source: string;
  target: string;
  data: {
    edgeType: string;
    sourceMultiplicity: '1' | '*';
    targetMultiplicity: '1' | '*';
  };
  type?: string;
};

const buttonStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  transition: 'all 0.2s ease',
  marginRight: '8px',
  minWidth: '120px',
};

// Grupos de botones de la barra (misma familia de color por grupo)
const groupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.12)',
};
const groupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.75)',
  marginRight: 4,
};
const groupBtn: React.CSSProperties = {
  ...buttonStyle,
  marginRight: 0,
  minWidth: 0,
  padding: '8px 12px',
  fontSize: 13,
};

const toolbarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 3000,
  // Efecto vidrio esmerilado: fondo translúcido + desenfoque de lo que hay detrás
  background: 'linear-gradient(135deg, rgba(38, 70, 83, 0.78) 0%, rgba(42, 100, 110, 0.6) 100%)',
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.35)',
  padding: '12px 16px',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginRight: '16px',
  flexWrap: 'wrap',
};

const titleStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 16,
  fontWeight: 'bold',
  margin: 0,
  marginRight: '24px',
  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
};

const statusStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: 12,
  background: 'rgba(255,255,255,0.2)',
  padding: '4px 8px',
  borderRadius: 12,
  marginRight: '16px',
};

const BoardPage = ({ mode = 'host' }: { mode?: 'host' | 'guest' }) => {
  // Estado para el asistente UML
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  // Chat compartido con la IA
  const userName = getCurrentUserName() || 'Anónimo';
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Vista activa: diagrama de clases o modelo entidad-relación (derivado del mismo diagrama)
  const [viewMode, setViewMode] = useState<'clases' | 'er'>('clases');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(70);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const update = () => setToolbarHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [chatUnread, setChatUnread] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  // Estado temporal para edición (evita conflictos con sincronización)
  const editTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Boards colaborativos desde Supabase
  const { boards, createBoard, deleteBoard, renameBoard } = useBoards();
  // La pizarra puede venir en el enlace (?board=<id>), así el invitado abre la misma que el anfitrión
  const [currentBoardId, setCurrentBoardId] = useState<string>(() => {
    const fromLink = new URLSearchParams(window.location.search).get('board');
    return fromLink && /^[\w-]+$/.test(fromLink) ? fromLink : '1';
  });
  const [showBoardMenu, setShowBoardMenu] = useState<boolean>(false);
  
  const currentBoard = boards.find(b => b.id === currentBoardId);
  const currentDiagramId = currentBoard?.diagram_id || '550e8400-e29b-41d4-a716-446655440000';

  // Referencia para evitar bucles infinitos
  const lastDiagramIdRef = useRef<string | null>(null);

  // Store con sincronización en tiempo real
  const {
    nodes: storeNodes,
    edges: storeEdges,
    isLoading,
    updateNode,
    saveDiagram,
    addClass,
    onNodesChange,
    onEdgesChange,
    setCurrentDiagram,
    loadDiagram,
    cleanupRealtimeSync,
  } = useClassStore();

  console.log('🔧 Component render - currentDiagramId:', currentDiagramId, 'isLoading:', isLoading);

  // Sincronizar el store con el diagrama actual
  useEffect(() => {
    if (lastDiagramIdRef.current !== currentDiagramId) {
      console.log(
        `🔄 Cambio de diagrama detectado: ${lastDiagramIdRef.current} → ${currentDiagramId}`
      );
      lastDiagramIdRef.current = currentDiagramId;
      setCurrentDiagram(currentDiagramId);
      loadDiagram(currentDiagramId);
    }
  }, [currentDiagramId, setCurrentDiagram, loadDiagram]);

  // Limpiar sincronización colaborativa al desmontar
  useEffect(() => {
    return () => {
      console.log('🧹 Limpiando sincronización al desmontar BoardPage');
      cleanupRealtimeSync();
    };
  }, [cleanupRealtimeSync]);

  // Estados de UI
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Estados de interacción
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [relationMode, setRelationMode] = useState<{
    sourceId: string | null;
    type: string | null;
    sourceMultiplicity?: '1' | '*';
    targetMultiplicity?: '1' | '*';
  } | null>(null);
  const [manyToManyMode, setManyToManyMode] = useState<{ sourceId: string | null } | null>(null);
  const [currentMode, setCurrentMode] = useState<'normal' | 'relation' | 'manyToMany'>('normal');
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Estados para importación de imágenes
  const [importing, setImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para importación de diagramas
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Sistema de debounce para guardado automático
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      console.log('💾 Guardado automático ejecutándose...');
      await saveDiagram();
    }, 2000);
  }, [saveDiagram]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Funciones de conversión entre tipos Supabase y UML
  const convertSupabaseToUMLNodes = (supabaseNodes: SupabaseNode[]): NodeType[] => {
    return supabaseNodes.map(node => {
      const attributes =
        node.data?.attributes?.map(attr => ({
          name: attr.name,
          scope: attr.scope,
          datatype: (attr.type as 'Integer' | 'Float' | 'String' | 'Boolean' | 'Date') || 'String',
        })) || [];

      const nodeType: NodeType = {
        id: node.id,
        label: node.data?.label || 'Class',
        x: node.position?.x || 0,
        y: node.position?.y || 0,
        attributes: attributes,
        asociativa: node.data?.asociativa || false,
        relaciona: node.data?.relaciona || undefined,
      };

      return {
        ...nodeType,
        height: calculateNodeHeight(nodeType),
      };
    });
  };

  const convertUMLToSupabaseNode = (node: NodeType) => ({
    id: node.id,
    type: 'default',
    position: { x: node.x, y: node.y },
    data: {
      label: node.label,
      attributes:
        node.attributes?.map(attr => ({
          id: `attr-${Date.now()}`,
          name: attr.name,
          type: attr.datatype,
          scope: attr.scope,
        })) || [],
      asociativa: node.asociativa,
      relaciona: node.relaciona,
    },
  });

  const convertReactFlowToUMLEdge = (edge: ReactFlowEdge): EdgeType => {
    const validEdgeTypes = [
      'asociacion',
      'agregacion',
      'composicion',
      'herencia',
      'dependencia',
    ] as const;
    const edgeType = edge.data?.edgeType || 'asociacion';
    const tipo = (validEdgeTypes as readonly string[]).includes(edgeType)
      ? (edgeType as EdgeType['tipo'])
      : 'asociacion';

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      tipo,
      multiplicidadOrigen: normalizeMultiplicity(edge.data?.sourceMultiplicity),
      multiplicidadDestino: normalizeMultiplicity(edge.data?.targetMultiplicity),
    };
  };

  const convertUMLToSupabaseEdge = (umlEdge: EdgeType): SupabaseEdgeOutput => {
    return {
      id: umlEdge.id,
      source: umlEdge.source,
      target: umlEdge.target,
      data: {
        edgeType: umlEdge.tipo,
        sourceMultiplicity: normalizeMultiplicity(umlEdge.multiplicidadOrigen),
        targetMultiplicity: normalizeMultiplicity(umlEdge.multiplicidadDestino),
      },
      type: 'umlEdge',
    };
  };

  const normalizeMultiplicity = (multiplicity: string | undefined): '1' | '*' => {
    if (!multiplicity) return '1';
    if (multiplicity.includes('..') || multiplicity === '*') return '*';
    return '1';
  };

  // Convertir nodos y edges del store
  const nodes = storeNodes ? convertSupabaseToUMLNodes(storeNodes as any) : [];
  const edges = storeEdges || [];

  const currentBoardData = boards.find(b => b.id === currentBoardId);

  const updateNodePosition = (nodeId: string, x: number, y: number) => {
    const nodeChanges: NodeChange[] = [
      {
        id: nodeId,
        type: 'position',
        position: { x, y },
      },
    ];
    onNodesChange(nodeChanges);
  };

  const finishNodeDrag = () => {
    debouncedSave();
  };

  const removeNodeAndEdges = async (nodeId: string) => {
    const nodeChanges: NodeChange[] = [{ id: nodeId, type: 'remove' }];
    onNodesChange(nodeChanges);

    const edgesToRemove = storeEdges?.filter(e => e.source === nodeId || e.target === nodeId) || [];
    const edgeChanges: EdgeChange[] = edgesToRemove.map(edge => ({ id: edge.id, type: 'remove' }));
    onEdgesChange(edgeChanges);

    await saveDiagram();
  };

  // 🆕 Funciones para el Asistente UML
  const handleCreateNodeFromPrompt = async (newNode: NodeType) => {
    console.log('🎯 Creando nodo desde prompt:', newNode);
    
    const supabaseNode = convertUMLToSupabaseNode(newNode);
    const nodeChanges: NodeChange[] = [
    { 
      type: 'add',
      item: supabaseNode 
    } as any
  ];
  onNodesChange(nodeChanges);
  
  await saveDiagram();
};

  const handleCreateEdgeFromPrompt = async (newEdge: EdgeType) => {
    console.log('🔗 Creando edge desde prompt:', newEdge);
    
  const supabaseEdge = convertUMLToSupabaseEdge(newEdge);
  const edgeChanges: EdgeChange[] = [
    { 
      type: 'add',
      item: supabaseEdge 
    } as any
  ];
  onEdgesChange(edgeChanges);
  
  await saveDiagram();
};

  const handleUpdateNodeFromPrompt = async (nodeId: string, updates: Partial<NodeType>) => {
    console.log('✏️ Actualizando nodo desde prompt:', nodeId, updates);
    
    await updateNode(nodeId, {
      label: updates.label,
      attributes: updates.attributes?.map(attr => ({
        id: `attr-${Date.now()}`,
        name: attr.name,
        type: attr.datatype,
        scope: attr.scope,
      })),
    } as any);
    
    await saveDiagram();
  };

  const handleUpdateEdgeFromPrompt = async (edgeId: string, updates: Partial<EdgeType>) => {
    console.log('🔄 Actualizando edge desde prompt:', edgeId, updates);
    // TODO: Implementar actualización de edges si es necesario
    await saveDiagram();
  };

  // Mostrar estado de carga - SOLO una vez, no en bucle
  if (isLoading && !storeNodes) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h3>Cargando diagrama desde Supabase...</h3>
        <div>Diagrama ID: {currentDiagramId}</div>
      </div>
    );
  }

  // Funciones para manejo de pizarras múltiples

  const switchToBoard = (boardId: string) => {
    if (boardId === currentBoardId) return;
    setCurrentBoardId(boardId);
    setShowBoardMenu(false);
  };

  const createNewBoard = async () => {
    try {
      const boardId = await createBoard(`Nueva Pizarra ${boards.length + 1}`);
      setCurrentBoardId(boardId);
      setShowBoardMenu(false);
    } catch {
      alert('Error creando pizarra');
    }
  };

  const deleteBoardConfirm = async (boardId: string) => {
    if (boards.length <= 1) {
      alert('No puedes eliminar la última pizarra');
      return;
    }

    if (window.confirm('¿Estás seguro de que quieres eliminar esta pizarra?')) {
      try {
        await deleteBoard(boardId);
        if (currentBoardId === boardId && boards.length > 1) {
          setCurrentBoardId(boards[0].id);
        }
      } catch {
        alert('Error eliminando pizarra');
      }
    }
    setShowBoardMenu(false);
  };

  const renameBoardPrompt = async (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    if (board) {
      const newName = window.prompt('Nuevo nombre para la pizarra:', board.name);
      if (newName && newName.trim()) {
        try {
          await renameBoard(boardId, newName.trim());
        } catch {
          alert('Error renombrando pizarra');
        }
      }
    }
    setShowBoardMenu(false);
  };

  const deleteEdge = async (edgeId: string) => {
    const edgeChanges: EdgeChange[] = [{ id: edgeId, type: 'remove' }];
    onEdgesChange(edgeChanges);
    await saveDiagram();
  };

  // Movimiento de nodos y panning
  const handleMouseDown = (e: React.MouseEvent, node: NodeType) => {
    e.stopPropagation();
    setDraggingId(node.id);
    setDragOffset({
      x: e.clientX / zoom - panOffset.x - node.x,
      y: e.clientY / zoom - panOffset.y - node.y,
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Solo iniciar panning si no estamos arrastrando un nodo
    if (!draggingId && e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseUp = () => {
    // 🔧 Si estábamos dragging, guardar la posición final
    if (draggingId) {
      finishNodeDrag();
    }
    
    setDraggingId(null);
    setDragOffset(null);
    setIsPanning(false);
    setPanStart(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingId && dragOffset) {
      //  Mover nodo solo localmente (sin await ni guardado inmediato)
      const newX = e.clientX / zoom - panOffset.x - dragOffset.x;
      const newY = e.clientY / zoom - panOffset.y - dragOffset.y;
      updateNodePosition(draggingId, newX, newY);
    } else if (isPanning && panStart) {
      // Hacer panning del canvas
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const addAttribute = async (id: string) => {
    const currentNode = storeNodes?.find(n => n.id === id);
    if (currentNode) {
      const currentAttrs = currentNode.data?.attributes || [];
      const newAttr = {
        id: `attr-${Date.now()}`,
        name: `Atributo${currentAttrs.length + 1}`,
        type: 'String' as 'Integer' | 'Float' | 'String' | 'Boolean' | 'Date',
        scope: 'private' as 'public' | 'private' | 'protected',
      };

      const newAttrs = [...currentAttrs, newAttr];
      await updateNode(id, { attributes: newAttrs });
      updateNode(id, { attributes: newAttrs } as any);
      debouncedSave();
    }
  };

  const deleteAttribute = async (nodeId: string, attrIdx: number) => {
    const currentNode = storeNodes?.find(n => n.id === nodeId);
    if (currentNode) {
      const newAttrs =
        currentNode.data?.attributes?.filter((_attr, idx: number) => idx !== attrIdx) || [];
      await updateNode(nodeId, { attributes: newAttrs });
      updateNode(nodeId, { attributes: newAttrs } as any);
      debouncedSave();
    }
  };

  const editNodeLabel = async (id: string, newLabel: string) => {
    // Actualizar localmente de inmediato
    updateNode(id, { label: newLabel } as any);
    
    // Limpiar timeout anterior
    if (editTimeoutRef.current) {
      clearTimeout(editTimeoutRef.current);
    }
    
    // Guardar en Supabase después de un delay (debounce)
    editTimeoutRef.current = setTimeout(async () => {
      await saveDiagram();
    }, 800);
  };

  const editAttribute = async (
    nodeId: string,
    attrIdx: number,
    field: 'name' | 'scope' | 'datatype',
    newValue: string
  ) => {
    const currentNode = storeNodes?.find(n => n.id === nodeId);
    if (currentNode) {
      const updatedAttrs =
        currentNode.data?.attributes?.map((attr: any, idx: number) =>
          idx === attrIdx ? { ...attr, [field === 'datatype' ? 'type' : field]: newValue } : attr
        ) || [];

      updateNode(nodeId, { attributes: updatedAttrs } as any);
      
      // Limpiar timeout anterior
      if (editTimeoutRef.current) {
        clearTimeout(editTimeoutRef.current);
      }
      
      // Guardar con debounce
      editTimeoutRef.current = setTimeout(async () => {
        await saveDiagram();
      }, 800);
    }
  };

  const handleStartRelation = (id: string, type: string) => {
    // 🎯 Procesar multiplicidad si viene en el formato "tipo:origen:destino"
    let relationType = type;
    let sourceMultiplicity: '1' | '*' = '1';
    let targetMultiplicity: '1' | '*' = '1';

    if (type.includes(':')) {
      const parts = type.split(':');
      relationType = parts[0];
      sourceMultiplicity = parts[1] as '1' | '*';
      targetMultiplicity = parts[2] as '1' | '*';
    }

    setRelationMode({
      sourceId: id,
      type: relationType,
      sourceMultiplicity,
      targetMultiplicity,
    });
    setCurrentMode('relation');
  };
  const handleSelectAsTarget = async (id: string) => {
    if (relationMode && relationMode.sourceId && relationMode.sourceId !== id) {
      // 🎯 Usar multiplicidades del relationMode si están disponibles, sino valores por defecto
      let multiplicidadOrigen: '1' | '*' = relationMode.sourceMultiplicity || '1';
      let multiplicidadDestino: '1' | '*' = relationMode.targetMultiplicity || '1';

      // Asignar multiplicidades por defecto según el tipo de relación (solo si no fueron especificadas)
      if (!relationMode.sourceMultiplicity && !relationMode.targetMultiplicity) {
        if (relationMode.type === 'herencia') {
          multiplicidadOrigen = '1';
          multiplicidadDestino = '1';
        } else if (relationMode.type === 'composicion' || relationMode.type === 'agregacion') {
          multiplicidadOrigen = '1';
          multiplicidadDestino = '*';
        } else if (relationMode.type === 'dependencia') {
          multiplicidadOrigen = '1';
          multiplicidadDestino = '1';
        }
      }

      const umlEdge: EdgeType = {
        id: `e${Date.now()}`,
        source: relationMode.sourceId,
        target: id,
        tipo: (relationMode.type || 'asociacion') as EdgeType['tipo'],
        multiplicidadOrigen,
        multiplicidadDestino,
      };

      const supabaseEdge = convertUMLToSupabaseEdge(umlEdge);
      const edgeChanges = [{ id: supabaseEdge.id, type: 'add', item: supabaseEdge }];
      onEdgesChange(edgeChanges as any);
      await saveDiagram();

      // Limpiar estado
      setRelationMode(null);
      setCurrentMode('normal');
    }
  };

  // Muchos a muchos
  const handleStartManyToMany = () => {
    setManyToManyMode({ sourceId: null });
    setCurrentMode('manyToMany');
  };
  const handleSelectManyToManySource = (id: string) => setManyToManyMode({ sourceId: id });
  const handleSelectManyToManyTarget = async (id: string) => {
    if (manyToManyMode?.sourceId && manyToManyMode.sourceId !== id) {
      const sourceNode = nodes.find(n => n.id === manyToManyMode.sourceId);
      const targetNode = nodes.find(n => n.id === id);
      const newTableLabel =
        window.prompt(
          'Nombre de la tabla intermedia:',
          `${sourceNode?.label}_${targetNode?.label}`
        ) || `Intermedia_${Date.now()}`;

      const newTableId = `T${Date.now()}`;

      // Crear nodo UML y convertir a Supabase
      const umlNode: NodeType = {
        id: newTableId,
        x: 200,
        y: 200,
        label: newTableLabel,
        attributes: [],
        asociativa: true,
        relaciona: [manyToManyMode.sourceId, id],
      };

      const supabaseNode = convertUMLToSupabaseNode(umlNode);
      const nodeChanges = [{ id: newTableId, type: 'add', item: supabaseNode }];
      onNodesChange(nodeChanges as any);

      // Crear edges UML y convertir a Supabase
      const umlEdge1: EdgeType = {
        id: `e${Date.now()}_1`,
        source: manyToManyMode.sourceId,
        target: newTableId,
        tipo: 'asociacion',
        multiplicidadOrigen: '1',
        multiplicidadDestino: '*',
      };

      const umlEdge2: EdgeType = {
        id: `e${Date.now()}_2`,
        source: id,
        target: newTableId,
        tipo: 'asociacion',
        multiplicidadOrigen: '1',
        multiplicidadDestino: '*',
      };

      const supabaseEdge1 = convertUMLToSupabaseEdge(umlEdge1);
      const supabaseEdge2 = convertUMLToSupabaseEdge(umlEdge2);

      const edgeChanges = [
        { id: supabaseEdge1.id, type: 'add', item: supabaseEdge1 },
        { id: supabaseEdge2.id, type: 'add', item: supabaseEdge2 },
      ];
      onEdgesChange(edgeChanges as any);

      await saveDiagram();
      setManyToManyMode(null);
      setCurrentMode('normal');
    }
  };

  const cancelCurrentMode = () => {
    setRelationMode(null);
    setManyToManyMode(null);
    setCurrentMode('normal');
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleFitAll = () => {
    if (nodes.length === 0) return;

    const margin = 50;
    const minX = Math.min(...nodes.map(n => n.x)) - margin;
    const maxX = Math.max(...nodes.map(n => n.x + NODE_WIDTH)) + margin;
    const minY = Math.min(...nodes.map(n => n.y)) - margin;
    const maxY = Math.max(...nodes.map(n => n.y + (n.height || NODE_HEIGHT))) + margin;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight - 70;

    const scaleX = viewWidth / contentWidth;
    const scaleY = viewHeight / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1.5);

    setZoom(newZoom);
    setPanOffset({
      x: (viewWidth - contentWidth * newZoom) / 2 - minX * newZoom,
      y: (viewHeight - contentHeight * newZoom) / 2 - minY * newZoom,
    });
  };

  // Helper para verificar si está bloqueado (solo afecta a invitados)
  const isLocked = () => {
    if (mode === 'host') return false;
    return currentBoardData?.locked || false;
  };

  const addNode = async () => {
    if (isLocked()) {
      alert('La pizarra está bloqueada por el anfitrión');
      return;
    }
    addClass();
    await saveDiagram();
  };

  const handleGenerarBackend = () => {
    generarBackend(
      nodes,
      edges.map(convertReactFlowToUMLEdge),
      currentBoardData?.name || 'Diagrama Principal'
    );
  };

  const handleGenerarFrontend = () => {
    generarFrontend(
      nodes,
      edges.map(convertReactFlowToUMLEdge),
      currentBoardData?.name || 'Diagrama Principal'
    );
  };

  const handleImportImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validaciones
    if (!file.type.startsWith('image/')) {
      alert('❌ Solo se permiten archivos de imagen');
      return;
    }

    // Las fotos grandes (celular) se reducen automáticamente en el servicio antes de subirlas
    if (file.size > 25 * 1024 * 1024) {
      alert('❌ El archivo debe ser menor a 25MB');
      return;
    }

    setImporting(true);
    console.log(`📤 Iniciando importación de: ${file.name}`);

    try {
      const result = await importDiagramFromImage(file, stage => setImportProgress(stage));

      if (result.success && result.nodes && result.edges) {
        // Los nodos e edges ya vienen con IDs únicos del servicio
        // Solo necesitamos agregar prefijo para evitar conflictos con nodos existentes
        const importTimestamp = Date.now();

        const importedNodes = result.nodes.map(node => ({
          ...node,
          id: `imported_${importTimestamp}_${node.id}`,
          // Actualizar relaciona para entidades asociativas
          relaciona: node.relaciona
            ? node.relaciona.map(relId => `imported_${importTimestamp}_${relId}`)
            : undefined,
        }));

        const importedEdges = result.edges.map(edge => ({
          ...edge,
          id: `imported_${importTimestamp}_${edge.id}`,
          source: `imported_${importTimestamp}_${edge.source}`,
          target: `imported_${importTimestamp}_${edge.target}`,
        }));

        // ✅ Convertir nodos importados a formato Supabase
        const supabaseNodes = importedNodes.map(node =>
          convertUMLToSupabaseNode({
            id: node.id,
            x: node.x,
            y: node.y,
            label: node.label,
            attributes:
              node.attributes?.map(attr => ({
                name: attr.name,
                datatype: attr.datatype,
                scope: attr.scope,
              })) || [],
            asociativa: node.asociativa,
            relaciona:
              node.relaciona && node.relaciona.length >= 2
                ? ([node.relaciona[0], node.relaciona[1]] as [string, string])
                : undefined,
          })
        );

        const supabaseEdges = importedEdges.map(edge =>
          convertUMLToSupabaseEdge({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            tipo: (edge.tipo || 'asociacion') as
              | 'asociacion'
              | 'agregacion'
              | 'composicion'
              | 'herencia'
              | 'dependencia',
            multiplicidadOrigen: edge.multiplicidadOrigen || '1',
            multiplicidadDestino: edge.multiplicidadDestino || '*',
          })
        );

        // Agregar a Supabase usando los cambios
        const nodeChanges = supabaseNodes.map(node => ({ id: node.id, type: 'add', item: node }));
        const edgeChanges = supabaseEdges.map(edge => ({ id: edge.id, type: 'add', item: edge }));

        onNodesChange(nodeChanges as any);
        onEdgesChange(edgeChanges as any);

        await saveDiagram();

        console.log(
          `✅ Importación exitosa: ${importedNodes.length} clases, ${importedEdges.length} relaciones`
        );
        alert(
          `✅ Diagrama importado exitosamente!\n${importedNodes.length} clases y ${importedEdges.length} relaciones agregadas` +
            (result.summary ? `\n\n${result.summary}` : '')
        );

        // Ajustar vista para mostrar todo el contenido
        setTimeout(() => handleFitAll(), 100);
      } else {
        console.error('❌ Error en importación:', result.error);
        alert(`❌ Error importando diagrama: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error inesperado:', error);
      alert(`❌ Error inesperado: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setImporting(false);
      setImportProgress('');
      // Limpiar input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Funciones para importar JSON
  const handleImportJSON = () => {
    jsonInputRef.current?.click();
  };

  const handleJSONFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      const text = await file.text();
      const { nodes: newNodes, edges: newEdges } = importFromJSON(text);

      // Convertir a formato Supabase
      const supabaseNodes = newNodes.map(convertUMLToSupabaseNode);
      const supabaseEdges = newEdges.map(convertUMLToSupabaseEdge);

      // Agregar al diagrama actual
      const nodeChanges = supabaseNodes.map((node: any) => ({
        id: node.id,
        type: 'add',
        item: node,
      }));
      const edgeChanges = supabaseEdges.map((edge: any) => ({
        id: edge.id,
        type: 'add',
        item: edge,
      }));

      onNodesChange(nodeChanges as any);
      onEdgesChange(edgeChanges as any);
      await saveDiagram();

      console.log('✅ Diagrama JSON importado exitosamente');
    } catch (error) {
      console.error('❌ Error importando JSON:', error);
      alert(
        `Error al importar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }

    // Limpiar input
    e.target.value = '';
  };

  const handleExportJSON = () => {
    try {
      const json = exportToJSON(nodes, edges.map(convertReactFlowToUMLEdge));
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentBoardData?.name || 'diagrama'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('✅ Diagrama exportado a JSON exitosamente');
    } catch (error) {
      console.error('❌ Error exportando JSON:', error);
      alert('Error al exportar el diagrama');
    }
  };

  const handleClearBoard = async () => {
    const confirmed = window.confirm(
      '¿Estás seguro de que quieres limpiar toda la pizarra?\n\n' +
        'Esta acción eliminará todos los nodos y relaciones del diagrama actual.\n' +
        'No se puede deshacer.'
    );

    if (!confirmed) return;

    try {
      // Obtener todos los nodos y edges actuales
      const allNodes = storeNodes || [];
      const allEdges = storeEdges || [];

      // Crear operaciones de eliminación para todos los elementos
      const nodeChanges = allNodes.map(node => ({ id: node.id, type: 'remove' }));
      const edgeChanges = allEdges.map(edge => ({ id: edge.id, type: 'remove' }));

      // Aplicar los cambios
      if (nodeChanges.length > 0) {
        onNodesChange(nodeChanges as any);
      }
      if (edgeChanges.length > 0) {
        onEdgesChange(edgeChanges as any);
      }

      // Guardar los cambios en Supabase
      await saveDiagram();

      console.log(
        `🗑️ Pizarra limpiada: ${nodeChanges.length} nodos y ${edgeChanges.length} relaciones eliminados`
      );
    } catch (error) {
      console.error('❌ Error limpiando pizarra:', error);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#f5f5f5',
        paddingTop: '70px',
        fontFamily: "'Comfortaa', 'Segoe UI', system-ui, sans-serif",
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseDown={e => {
        // Solo cerrar el menú si el clic no fue en la barra de herramientas
        const toolbar = e.currentTarget.querySelector('[data-toolbar="true"]');
        if (toolbar && !toolbar.contains(e.target as Node)) {
          handleCanvasMouseDown(e);
          // Cerrar menú de pizarras al hacer clic en el canvas
          if (showBoardMenu) {
            console.log('🔸 Closing menu due to canvas click');
            setShowBoardMenu(false);
          }
        }
      }}
    >
      {/* Barra de herramientas superior */}
      <div ref={toolbarRef} style={toolbarStyle} data-toolbar='true'>
        <h1 style={titleStyle}>🎨 UML Designer</h1>
        
        {/* Indicador de modo */}
        <span style={{ ...statusStyle, background: mode === 'host' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(33, 150, 243, 0.3)' }}>
          {mode === 'host' ? '🏠 Anfitrión' : '👤 Invitado'}
        </span>
        <span style={statusStyle} title='Tu nombre en el chat'>
          🙋 {userName}
        </span>

        {/* Selector de pizarras */}
        <div style={{ position: 'relative', marginRight: '16px' }}>
          <button
            onClick={e => {
              e.stopPropagation(); // Evitar que el clic llegue al contenedor
              console.log('🔵 Board menu button clicked!');
              console.log('Current showBoardMenu:', showBoardMenu);
              const newShowBoardMenu = !showBoardMenu;
              console.log('Will set showBoardMenu to:', newShowBoardMenu);
              setShowBoardMenu(newShowBoardMenu);

              // Verificar después de un momento que se aplicó
              setTimeout(() => {
                console.log('After state update - showBoardMenu should be:', newShowBoardMenu);
              }, 100);
            }}
            style={{
              ...buttonStyle,
              background: '#4a90e2',
              color: '#fff',
              minWidth: '200px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            title='Seleccionar pizarra'
          >
            <span>📋 {currentBoardData?.name || 'Diagrama Principal'}</span>
            <span style={{ marginLeft: '8px' }}>▼</span>
          </button>

          {showBoardMenu && (
            <div
              style={{
                position: 'fixed',
                top: '60px',
                left: boards.length > 1 ? '300px' : '250px',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 4000,
                minWidth: '250px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
              onMouseEnter={() =>
                console.log('🎯 Menu is being rendered! showBoardMenu=', showBoardMenu)
              }
              onClick={e => e.stopPropagation()} // Evitar que clics en el menú lo cierren
            >
              <div
                style={{
                  padding: '8px 16px',
                  borderBottom: '1px solid #eee',
                  background: '#f8f9fa',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333',
                }}
              >
                Pizarras disponibles
              </div>

              {boards.map(board => (
                <div
                  key={board.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    background: board.id === currentBoardId ? '#e3f2fd' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    onClick={() => {
                      console.log('🔴 Board item clicked!', board.name, board.id);
                      console.log('Current board ID:', currentBoardId);
                      switchToBoard(board.id);
                    }}
                    style={{
                      flex: 1,
                      fontWeight: board.id === currentBoardId ? 'bold' : 'normal',
                      color: board.id === currentBoardId ? '#1976d2' : '#333',
                    }}
                  >
                    📋 {board.name}
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      renameBoardPrompt(board.id);
                    }}
                    title='Renombrar pizarra'
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      marginRight: '4px',
                      borderRadius: '4px',
                      color: '#666',
                    }}
                  >
                    ✏️
                  </button>
                  {boards.length > 1 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        deleteBoardConfirm(board.id);
                      }}
                      title='Eliminar pizarra'
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: '#c00',
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}

              <div
                onClick={() => {
                  console.log('🟢 Create New Board clicked from menu!');
                  createNewBoard();
                }}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: '#f8f9fa',
                  borderTop: '1px solid #eee',
                  color: '#1976d2',
                  fontWeight: 'bold',
                  borderRadius: '0 0 8px 8px',
                }}
              >
                ➕ Crear Nueva Pizarra
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
          {currentMode === 'manyToMany' ? (
            <div style={statusStyle}>🔗 Modo Relación M:N</div>
          ) : currentMode === 'relation' ? (
            <div style={statusStyle}>➡️ Modo Relación</div>
          ) : mode === 'host' ? (
            <>
              <button
                onClick={() => {
                  const guestUrl = `${window.location.origin}/board/guest?board=${encodeURIComponent(currentBoardId)}`;
                  navigator.clipboard.writeText(guestUrl);
                  alert('Enlace de invitado copiado (abre esta pizarra): ' + guestUrl);
                }}
                style={{
                  ...buttonStyle,
                  background: '#2196f3',
                  color: '#fff',
                  minWidth: '120px',
                  fontSize: 12,
                  padding: '8px 12px',
                }}
                title='Compartir: copia el enlace para invitar a otras personas como invitados'
              >
                🔗 Compartir
              </button>
              <button
                onClick={async () => {
                  if (!currentBoardData) return;
                  const newLocked = !currentBoardData.locked;
                  await supabase
                    .from('boards')
                    .update({ locked: newLocked })
                    .eq('id', currentBoardData.id);
                  alert(newLocked ? 'Pizarra bloqueada' : 'Pizarra desbloqueada');
                }}
                style={{
                  ...buttonStyle,
                  background: currentBoardData?.locked ? '#f44336' : '#ff9800',
                  color: '#fff',
                  fontSize: 12,
                  padding: '8px 12px',
                }}
                title={currentBoardData?.locked ? 'Desbloquear: los invitados vuelven a poder editar la pizarra' : 'Bloquear: los invitados solo podrán ver la pizarra, sin editar'}
              >
                {currentBoardData?.locked ? '🔒 Bloqueada' : '🔓 Bloquear'}
              </button>
            </>
          ) : null}
        </div>

        {/* Botones principales (agrupados) */}
        <div style={{ ...sectionStyle, gap: 10 }}>
          {/* Grupo: Diagrama */}
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Diagrama</span>
            <button
              onClick={addNode}
              style={{ ...groupBtn, background: isLocked() ? '#ccc' : '#1976d2', color: '#fff', cursor: isLocked() ? 'not-allowed' : 'pointer' }}
              title='Nueva clase: agrega una clase vacía al diagrama'
              disabled={isLocked()}
            >
              ➕ Nueva Clase
            </button>
            <button
              onClick={() => {
                if (isLocked()) {
                  alert('La pizarra está bloqueada por el anfitrión');
                  return;
                }
                console.log('🤖 Abriendo Asistente UML');
                setIsPromptOpen(true);
              }}
              style={{ ...groupBtn, background: isLocked() ? '#ccc' : '#1976d2', color: '#fff', cursor: isLocked() ? 'not-allowed' : 'pointer' }}
              title='Asistente UML: escribe o dicta una instrucción y la IA agrega, cambia, elimina o mueve clases'
            >
              ✨ Asistente UML
            </button>
            <button
              onClick={handleStartManyToMany}
              style={{
                ...groupBtn,
                background: currentMode === 'manyToMany' ? '#ff9800' : '#1976d2',
                color: '#fff',
              }}
              disabled={currentMode === 'relation'}
              title='Muchos a Muchos: elige dos clases y crea la tabla intermedia entre ellas'
            >
              ⚡ Muchos a Muchos
            </button>
          </div>

          {/* Grupo: Archivo */}
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Archivo</span>
            <button
              onClick={handleImportImage}
              style={{
                ...groupBtn,
                background: importing || isLocked() ? '#ccc' : '#00897b',
                color: '#fff',
                opacity: importing || isLocked() ? 0.7 : 1,
                cursor: importing || isLocked() ? 'not-allowed' : 'pointer',
              }}
              disabled={importing || isLocked()}
              title='Importar imagen: sube una foto o captura de un diagrama de clases y la IA lo convierte en diagrama editable'
            >
              {importing ? '⏳ Importando...' : '📸 Importar Imagen'}
            </button>
            <button
              onClick={handleImportJSON}
              style={{ ...groupBtn, background: '#00897b', color: '#fff' }}
              title='Importar JSON: carga un diagrama guardado antes desde un archivo .json'
            >
              📄 Importar JSON
            </button>
            <button
              onClick={handleExportJSON}
              style={{ ...groupBtn, background: '#00897b', color: '#fff' }}
              title='Exportar JSON: descarga el diagrama actual como archivo .json'
            >
              💾 Exportar JSON
            </button>
          </div>

          {/* Grupo: Generar código */}
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Generar</span>
            <button
              onClick={handleGenerarBackend}
              style={{ ...groupBtn, background: '#ef6c00', color: '#fff' }}
              title='Backend: genera un proyecto Spring Boot (ZIP) con las entidades del diagrama'
            >
              ⚙️ Backend
            </button>
            <button
              onClick={handleGenerarFrontend}
              style={{ ...groupBtn, background: '#ef6c00', color: '#fff' }}
              title='Frontend: genera una app Flutter (ZIP) con un CRUD por cada clase'
            >
              📱 Frontend
            </button>
            <button
              onClick={() =>
                exportarSql(
                  nodes,
                  edges.map(convertReactFlowToUMLEdge),
                  currentBoardData?.name || 'Diagrama Principal'
                )
              }
              style={{ ...groupBtn, background: '#ef6c00', color: '#fff' }}
              title='SQL: descarga el script CREATE TABLE para PostgreSQL (tablas, PK y FK) del modelo entidad-relación'
            >
              🧾 SQL
            </button>
          </div>

          {/* Grupo: Vista (zoom) */}
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Vista</span>
            <button
              onClick={() => setViewMode(v => (v === 'clases' ? 'er' : 'clases'))}
              style={{ ...groupBtn, background: viewMode === 'er' ? '#ff9800' : '#546e7a', color: '#fff' }}
              title={
                viewMode === 'er'
                  ? 'Volver al diagrama de clases para editar'
                  : 'Ver el modelo entidad-relación (tablas, PK, FK, notación pata de gallo) generado del diagrama'
              }
            >
              {viewMode === 'er' ? '🗂️ Ver Clases' : '📊 Ver ER'}
            </button>
            <button onClick={handleZoomOut} style={{ ...groupBtn, background: '#546e7a', color: '#fff' }} title='Alejar: reduce el zoom del diagrama'>
              🔍-
            </button>
            <span style={{ color: '#fff', fontSize: 12, minWidth: '40px', textAlign: 'center' }} title='Zoom actual'>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={handleZoomIn} style={{ ...groupBtn, background: '#546e7a', color: '#fff' }} title='Acercar: aumenta el zoom del diagrama'>
              🔍+
            </button>
            <button onClick={handleResetZoom} style={{ ...groupBtn, background: '#546e7a', color: '#fff' }} title='Restablecer zoom: vuelve al 100%'>
              🎯
            </button>
            <button onClick={handleFitAll} style={{ ...groupBtn, background: '#546e7a', color: '#fff' }} title='Ajustar a pantalla: muestra todas las clases a la vez'>
              📐
            </button>
          </div>

          {/* Acción destructiva, separada del resto */}
          <button
            onClick={handleClearBoard}
            style={{ ...groupBtn, background: '#c62828', color: '#fff' }}
            title='Limpiar pizarra: elimina TODAS las clases y relaciones del diagrama'
          >
            🗑️ Limpiar Pizarra
          </button>
        </div>

        <div style={{ flex: 1 }}></div>

        {/* Botón del chat compartido con la IA */}
        <button
          onClick={() => setIsChatOpen(open => !open)}
          style={{
            ...buttonStyle,
            background: isChatOpen ? '#4527a0' : '#5e35b1',
            color: '#fff',
            position: 'relative',
            minWidth: '110px',
          }}
          title='Chat IA: conversa con el equipo y la IA desarrolladora senior; todos ven las preguntas y respuestas'
        >
          💬 Chat IA{onlineCount > 0 ? ` · 👥 ${onlineCount}` : ''}
          {chatUnread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: '#e53935',
                color: '#fff',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 6px',
              }}
            >
              {chatUnread}
            </span>
          )}
        </button>

        {/* Botón cerrar sesión */}
        <button
          onClick={() => {
            clearCurrentUserName();
            window.location.href = '/login';
          }}
          style={{
            ...buttonStyle,
            background: '#e53935',
            color: '#fff',
            fontSize: 12,
            padding: '8px 12px',
            marginRight: '8px',
          }}
          title='Salir: cierra tu sesión y vuelve al login'
        >
          🚪 Salir
        </button>

        {/* Instrucciones y cancelar (solo cuando aplica) */}
        {currentMode !== 'normal' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {currentMode === 'manyToMany' && (
              <span style={{ color: '#fff', fontSize: 12 }}>
                {!manyToManyMode?.sourceId ? '1️⃣ Selecciona la primera clase' : '2️⃣ Selecciona la segunda clase'}
              </span>
            )}
            {currentMode === 'relation' && (
              <span style={{ color: '#fff', fontSize: 12 }}>
                {!relationMode?.sourceId ? '1️⃣ Selecciona la clase origen' : '2️⃣ Selecciona la clase destino'}
              </span>
            )}
            <button onClick={cancelCurrentMode} style={{ ...buttonStyle, background: '#f44336', color: '#fff', marginRight: '0' }}>
              ❌ Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input ref={jsonInputRef} type='file' accept='.json' style={{ display: 'none' }} onChange={handleJSONFileSelect} />
      <input ref={fileInputRef} type='file' accept='image/*' onChange={handleFileSelect} style={{ display: 'none' }} />

      {viewMode === 'er' && (
        <ErView nodes={nodes} edges={edges.map(convertReactFlowToUMLEdge)} top={toolbarHeight} />
      )}

      {/* Canvas */}
      <div
        style={{
          transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
          transformOrigin: 'top left',
          width: '100%',
          height: '100%',
        }}
      >
        <EdgeLayer
          nodes={nodes}
          edges={edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            tipo: (edge.data?.edgeType || 'asociacion') as EdgeType['tipo'],
            multiplicidadOrigen: (edge.data?.sourceMultiplicity || '1') as '1' | '*',
            multiplicidadDestino: (edge.data?.targetMultiplicity || '1') as '1' | '*',
          }))}
          onDeleteEdge={deleteEdge}
        />
        {nodes.map(n => (
          <Node
            key={n.id}
            node={n}
            onMouseDown={handleMouseDown}
            addAttribute={addAttribute}
            onStartRelation={handleStartRelation}
            relationMode={!!relationMode}
            isRelationOrigin={relationMode?.sourceId === n.id}
            onSelectAsTarget={handleSelectAsTarget}
            onClick={() => {
              if (manyToManyMode) {
                if (!manyToManyMode.sourceId) handleSelectManyToManySource(n.id);
                else handleSelectManyToManyTarget(n.id);
              }
            }}
            onEditLabel={editNodeLabel}
            onEditAttribute={editAttribute}
            onDeleteAttribute={deleteAttribute}
            onDeleteNode={removeNodeAndEdges}
            isLocked={isLocked()}
          />
        ))}
      </div>

      {/* Import overlay */}
      {importing && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          <div style={{ background: '#333', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>📤 Importando diagrama...</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{importProgress || 'Procesando imagen...'}</div>
          </div>
        </div>
      )}

      {/* 🆕 Modal del Asistente UML */}
      <UmlPrompt
        isOpen={isPromptOpen}
        onClose={() => {
          console.log('❌ Cerrando Asistente UML');
          setIsPromptOpen(false);
        }}
        onCreateNode={handleCreateNodeFromPrompt}
        onCreateEdge={handleCreateEdgeFromPrompt}
        onUpdateNode={handleUpdateNodeFromPrompt}
        onUpdateEdge={handleUpdateEdgeFromPrompt}
        onDeleteNode={removeNodeAndEdges}
        onDeleteEdge={deleteEdge}
        onMoveNode={(id, x, y) => {
          updateNodePosition(id, x, y);
          debouncedSave();
        }}
        existingNodes={nodes}
        existingEdges={edges.map(convertReactFlowToUMLEdge)}
      />

      {/* 💬 Chat compartido con la IA "dev senior" (siempre montado para contar no leídos) */}
      {currentBoardData && (
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          boardId={currentBoardData.id}
          boardName={currentBoardData.name}
          userName={userName}
          isHost={mode === 'host'}
          nodes={nodes}
          edges={edges.map(convertReactFlowToUMLEdge)}
          onUnreadChange={setChatUnread}
          onOnlineChange={setOnlineCount}
        />
      )}
    </div>
  );
};

export default BoardPage;
