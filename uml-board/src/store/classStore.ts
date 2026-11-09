import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { supabase, handleSupabaseError } from '../lib/supabase.config';
import type { ReactFlowNode, ReactFlowEdge, Diagram, Json } from '../lib/types/database.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

type AttrType = 'Integer' | 'Float' | 'String' | 'Boolean' | 'Date';
type Scope = 'public' | 'private' | 'protected';
type Multiplicity = '1' | '1..*';

interface ClassData {
  label: string;
  attributes: {
    id: string;
    name: string;
    type: AttrType;
    scope: Scope;
  }[];
  asociativa?: boolean;
  relaciona?: string[];
}

interface EdgeData {
  sourceMultiplicity: Multiplicity;
  targetMultiplicity: Multiplicity;
  edgeType?: string;
}

interface Store {
  nodes: Node<ClassData>[];
  edges: Edge<EdgeData>[];
  currentDiagramId: string | null;
  isLoading: boolean;
  error: string | null;

  // Funciones básicas
  addClass: () => void;
  updateNode: (id: string, data: Partial<ClassData>) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  updateEdge: (edgeId: string, d: Partial<EdgeData>) => void;

  // Funciones de Supabase
  setCurrentDiagram: (diagramId: string) => void;
  loadDiagram: (diagramId: string) => Promise<void>;
  saveDiagram: () => Promise<void>;
  updateDiagramInSupabase: (nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => Promise<void>;

  // 🔴 Funciones de tiempo real colaborativo
  setupRealtimeSync: () => void;
  cleanupRealtimeSync: () => void;
}

// 🔴 Variable global para el canal de tiempo real (fuera del store para evitar re-renders)
let realtimeChannel: RealtimeChannel | null = null;

// 🔴 Variable para rastrear ediciones activas y evitar sobrescribir cambios locales
let lastEditTimestamp: number = 0; // Timestamp de la última edición del usuario

export const useClassStore = create<Store>((set, get) => ({
  nodes: [],
  edges: [],
  currentDiagramId: null,
  isLoading: false,
  error: null,

  // Funciones básicas
  addClass: () => {
    const state = get();
    const newNode: Node<ClassData> = {
      id: uuidv4(),
      type: 'default',
      data: {
        label: `Class${state.nodes.length + 1}`,
        attributes: [],
      },
      position: {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      },
    };

    set(s => ({ nodes: [...s.nodes, newNode] }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar si hay un diagrama activo
    // if (state.currentDiagramId && !state.isLoading) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  updateNode: (id: string, data: Partial<ClassData>) => {
    // 🔴 Marcar el momento de la edición para bloquear sync temporal
    lastEditTimestamp = Date.now();
    
    // Actualizar localmente
    set(s => ({
      nodes: s.nodes.map((n: Node<ClassData>) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar cambios
    // const state = get();
    // if (state.currentDiagramId && !state.isLoading) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  onNodesChange: (changes: NodeChange[]) => {
    set(s => ({ nodes: applyNodeChanges(changes, s.nodes) }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar después de cambios
    // const state = get();
    // if (state.currentDiagramId && !state.isLoading) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set(s => ({
      edges: applyEdgeChanges(changes, s.edges).map(e => ({
        ...e,
        data: {
          sourceMultiplicity: ((e.data as EdgeData)?.sourceMultiplicity ?? '1') as Multiplicity,
          targetMultiplicity: ((e.data as EdgeData)?.targetMultiplicity ?? '1') as Multiplicity,
          edgeType: (e.data as EdgeData)?.edgeType,
        },
      })) as Edge<EdgeData>[],
    }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar después de cambios
    // const state = get();
    // if (state.currentDiagramId && !state.isLoading) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  onConnect: (params: Connection) => {
    const edge: Edge<EdgeData> = {
      ...params,
      id: `${params.source}-${params.target}-${Date.now()}`,
      type: 'umlEdge',
      data: {
        sourceMultiplicity: '1',
        targetMultiplicity: '1',
        edgeType: 'asociacion',
      },
      source: params.source ?? '',
      target: params.target ?? '',
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
    };

    set(s => ({ edges: addEdge(edge, s.edges) }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar después de crear conexión
    // const state = get();
    // if (state.currentDiagramId) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  updateEdge: (edgeId: string, d: Partial<EdgeData>) => {
    set(s => ({
      edges: s.edges.map((e: Edge<EdgeData>) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                sourceMultiplicity: (d.sourceMultiplicity ??
                  (e.data ? e.data.sourceMultiplicity : '1') ??
                  '1') as Multiplicity,
                targetMultiplicity: (d.targetMultiplicity ??
                  (e.data ? e.data.targetMultiplicity : '1') ??
                  '1') as Multiplicity,
                edgeType: d.edgeType ?? (e.data ? e.data.edgeType : undefined),
              },
            }
          : e
      ),
    }));

    // TEMPORALMENTE DESACTIVADO - Auto-guardar después de actualizar edge
    // const state = get();
    // if (state.currentDiagramId) {
    //   setTimeout(() => get().saveDiagram(), 100);
    // }
  },

  // Funciones de Supabase
  setCurrentDiagram: (diagramId: string) => {
    const currentState = get();
    // 🔧 Solo cambiar si es diferente para evitar bucles - técnica del historial
    if (currentState.currentDiagramId !== diagramId) {
      console.log(`🔄 Store: Cambio diagrama ${currentState.currentDiagramId} → ${diagramId}`);

      // 🔴 Limpiar suscripción anterior antes de cambiar
      get().cleanupRealtimeSync();

      set({ currentDiagramId: diagramId });
      // 🔧 NO cargar automáticamente para evitar bucles infinitos
    }
  },

  loadDiagram: async (diagramId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: diagramData, error: diagramError } = await supabase
        .from('diagrams')
        .select('*')
        .eq('id', diagramId)
        .single();

      if (diagramError) {
        handleSupabaseError(diagramError, 'cargar diagrama');
        return;
      }

      if (diagramData) {
        // Convertir datos de Supabase a formato ReactFlow
        const reactFlowNodes: Node<ClassData>[] = (
          (diagramData.nodes as unknown as ReactFlowNode[]) || []
        ).map(node => ({
          id: node.id,
          type: node.type || 'default',
          position: node.position,
          data: {
            label: node.data?.label || 'Class',
            attributes: (node.data?.attributes || []).map(attr => ({
              id: attr.id,
              name: attr.name,
              type: attr.type as AttrType,
              scope: attr.scope as Scope,
            })),
            asociativa: node.data?.asociativa,
            relaciona: node.data?.relaciona,
          },
        }));

        const reactFlowEdges: Edge<EdgeData>[] = (
          (diagramData.edges as unknown as ReactFlowEdge[]) || []
        ).map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'umlEdge',
          data: {
            sourceMultiplicity: (edge.data?.sourceMultiplicity || '1') as Multiplicity,
            targetMultiplicity: (edge.data?.targetMultiplicity || '1') as Multiplicity,
            edgeType: edge.data?.edgeType,
          },
        }));

        set({
          nodes: reactFlowNodes,
          edges: reactFlowEdges,
          currentDiagramId: diagramId,
          isLoading: false,
        });

        console.log(
          `✅ Diagrama cargado: ${reactFlowNodes.length} nodos, ${reactFlowEdges.length} edges`
        );

        // 🔴 Configurar tiempo real colaborativo después de cargar
        setTimeout(() => {
          get().setupRealtimeSync();
        }, 500); // Pequeño delay para asegurar que el estado esté sincronizado
      }
    } catch (error) {
      console.error('❌ Error cargando diagrama:', error);
      set({ error: 'Error cargando diagrama', isLoading: false });
    }
  },

  saveDiagram: async () => {
    const state = get();
    if (!state.currentDiagramId) {
      console.warn('⚠️ No hay diagrama activo para guardar');
      return;
    }

    try {
      set({ isLoading: true, error: null });

      // Convertir nodos y edges al formato ReactFlow para Supabase
      const reactFlowNodes: ReactFlowNode[] = state.nodes.map(node => ({
        id: node.id,
        type: node.type || 'default',
        position: node.position,
        data: {
          label: node.data.label,
          attributes: node.data.attributes?.map(attr => ({
            id: attr.id,
            name: attr.name,
            type: attr.type,
            scope: attr.scope,
          })),
          asociativa: node.data.asociativa,
          relaciona: node.data.relaciona,
        },
      }));

      const reactFlowEdges: ReactFlowEdge[] = state.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        data: {
          edgeType: edge.data?.edgeType,
          sourceMultiplicity: edge.data?.sourceMultiplicity,
          targetMultiplicity: edge.data?.targetMultiplicity,
        },
      }));

      await get().updateDiagramInSupabase(reactFlowNodes, reactFlowEdges);
      console.log('✅ Diagrama guardado completamente');
    } catch (error) {
      console.error('❌ Error guardando diagrama:', error);
      set({ error: error instanceof Error ? error.message : 'Error guardando diagrama' });
    } finally {
      set({ isLoading: false });
    }
  },

  updateDiagramInSupabase: async (nodes: ReactFlowNode[], edges: ReactFlowEdge[]) => {
    const state = get();
    if (!state.currentDiagramId) return;

    try {
      const { error } = await supabase
        .from('diagrams')
        .update({
          nodes: JSON.parse(JSON.stringify(nodes)) as Json,
          edges: JSON.parse(JSON.stringify(edges)) as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.currentDiagramId);

      if (error) {
        handleSupabaseError(error, `actualizar diagrama ${state.currentDiagramId}`);
      }
    } catch (error) {
      console.error('❌ Error actualizando diagrama en Supabase:', error);
      throw error;
    }
  },

  // 🔴 Configurar sincronización en tiempo real colaborativo
  setupRealtimeSync: () => {
    const state = get();
    if (!state.currentDiagramId || realtimeChannel) return;

    console.log(
      `🔴 Configurando tiempo real colaborativo para diagrama: ${state.currentDiagramId}`
    );

    realtimeChannel = supabase
      .channel(`collaborative_diagram_${state.currentDiagramId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'diagrams',
          filter: `id=eq.${state.currentDiagramId}`,
        },
        payload => {
          console.log('🔄 Cambio colaborativo detectado:', payload);

          // 🚫 IGNORAR sincronización si hubo una edición reciente (últimos 3 segundos)
          const timeSinceLastEdit = Date.now() - lastEditTimestamp;
          if (timeSinceLastEdit < 3000) {
            console.log(`⏸️ Ignorando sync - edición activa hace ${timeSinceLastEdit}ms`);
            return;
          }

          if (payload.new) {
            const updatedDiagram = payload.new as Diagram;
            const updatedNodes: Node<ClassData>[] = (
              (updatedDiagram.nodes as unknown as ReactFlowNode[]) || []
            ).map(node => ({
              id: node.id,
              type: node.type || 'default',
              position: node.position,
              data: {
                label: node.data?.label || 'Class',
                attributes: (node.data?.attributes || []).map(attr => ({
                  id: attr.id,
                  name: attr.name,
                  type: attr.type as AttrType,
                  scope: attr.scope as Scope,
                })),
                asociativa: node.data?.asociativa,
                relaciona: node.data?.relaciona,
              },
            }));

            const updatedEdges: Edge<EdgeData>[] = (
              (updatedDiagram.edges as unknown as ReactFlowEdge[]) || []
            ).map(edge => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              type: edge.type || 'umlEdge',
              data: {
                sourceMultiplicity: (edge.data?.sourceMultiplicity || '1') as Multiplicity,
                targetMultiplicity: (edge.data?.targetMultiplicity || '1') as Multiplicity,
                edgeType: edge.data?.edgeType,
              },
            }));

            // 🔄 Actualizar estado solo si los datos realmente cambiaron (evita bucles)
            const currentState = get();
            const nodesChanged =
              JSON.stringify(currentState.nodes) !== JSON.stringify(updatedNodes);
            const edgesChanged =
              JSON.stringify(currentState.edges) !== JSON.stringify(updatedEdges);

            if (nodesChanged || edgesChanged) {
              console.log(
                `🔄 Aplicando cambios colaborativos: ${updatedNodes.length} nodos, ${updatedEdges.length} edges`
              );
              set({
                nodes: updatedNodes,
                edges: updatedEdges,
              });
            }
          }
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Sincronización colaborativa activa');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error en sincronización colaborativa');
        }
      });
  },

  // 🔴 Limpiar sincronización colaborativa
  cleanupRealtimeSync: () => {
    if (realtimeChannel) {
      console.log('🧹 Limpiando sincronización colaborativa');
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    
    // Reset timestamp
    lastEditTimestamp = 0;
  },
}));
