import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase.config';
import type { ReactFlowNode, ReactFlowEdge, Diagram, Board } from '../lib/types/database.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Hook para sincronización de diagramas en tiempo real
interface UseDiagramSyncReturn {
  nodes: ReactFlowNode[] | null;
  edges: ReactFlowEdge[] | null;
  isLoading: boolean;
  error: string | null;
}

export function useDiagramSync(diagramId: string): UseDiagramSyncReturn {
  const [nodes, setNodes] = useState<ReactFlowNode[] | null>(null);
  const [edges, setEdges] = useState<ReactFlowEdge[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔧 Ref para evitar bucles infinitos - técnica que usamos en el historial
  const lastLoadedDiagramId = useRef<string | null>(null);

  // ✅ Cargar datos solo cuando realmente cambia el diagramId
  useEffect(() => {
    // 🔧 Solo cargar si realmente cambió el diagrama
    if (!diagramId || lastLoadedDiagramId.current === diagramId) {
      if (!diagramId) {
        setIsLoading(false);
      }
      return;
    }

    const loadDiagramData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        lastLoadedDiagramId.current = diagramId; // 🔧 Marcar como cargado

        console.log(`🔄 Cargando diagrama: ${diagramId}`);

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
          const diagramNodes = (diagramData.nodes as unknown as ReactFlowNode[]) || [];
          const diagramEdges = (diagramData.edges as unknown as ReactFlowEdge[]) || [];

          setNodes(diagramNodes);
          setEdges(diagramEdges);

          console.log(
            `✅ Diagrama cargado: ${diagramNodes.length} nodos, ${diagramEdges.length} edges`
          );
        } else {
          setNodes([]);
          setEdges([]);
        }
      } catch (err) {
        console.error('❌ Error cargando diagrama:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    loadDiagramData();
  }, [diagramId]); // 🔧 Solo diagramId como dependencia

  // ✅ Configurar tiempo real por separado para evitar bucles
  useEffect(() => {
    if (!diagramId) return;

    let channel: RealtimeChannel;

    const setupRealtimeSubscription = () => {
      try {
        console.log(`🔴 Configurando tiempo real para diagrama: ${diagramId}`);

        channel = supabase
          .channel(`diagram_${diagramId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'diagrams',
              filter: `id=eq.${diagramId}`,
            },
            payload => {
              console.log('🔄 Cambio en diagrama detectado:', payload);

              if (payload.new) {
                const updatedDiagram = payload.new as Diagram;
                const updatedNodes = (updatedDiagram.nodes as unknown as ReactFlowNode[]) || [];
                const updatedEdges = (updatedDiagram.edges as unknown as ReactFlowEdge[]) || [];

                setNodes(updatedNodes);
                setEdges(updatedEdges);

                console.log(
                  `🔄 Diagrama actualizado: ${updatedNodes.length} nodos, ${updatedEdges.length} edges`
                );
              }
            }
          )
          .subscribe();

        console.log('✅ Suscripción en tiempo real configurada');
      } catch (err) {
        console.error('❌ Error configurando tiempo real:', err);
        setError('Error configurando sincronización en tiempo real');
      }
    };

    setupRealtimeSubscription();

    return () => {
      console.log('🧹 Limpiando suscripción de tiempo real');
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [diagramId]); // 🔧 Tiempo real independiente

  return {
    nodes,
    edges,
    isLoading,
    error,
  };
}

// Hook para gestionar pizarras (boards)
interface UseBoardsReturn {
  boards: Board[];
  isLoading: boolean;
  error: string | null;
  createBoard: (name: string, description?: string) => Promise<string>;
  deleteBoard: (boardId: string) => Promise<void>;
  renameBoard: (boardId: string, newName: string) => Promise<void>;
  refreshBoards: () => Promise<void>;
}

export function useBoards(): UseBoardsReturn {
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar todas las pizarras
  const loadBoards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 Cargando pizarras...');

      const { data, error: queryError } = await supabase
        .from('boards')
        .select('*')
        .order('created_at', { ascending: true });

      if (queryError) {
        handleSupabaseError(queryError, 'cargar pizarras');
      }

      setBoards(data || []);
      console.log(`✅ ${data?.length || 0} pizarras cargadas`);
    } catch (err) {
      console.error('❌ Error cargando pizarras:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Crear nueva pizarra
  const createBoard = useCallback(async (name: string): Promise<string> => {
    try {
      console.log(`➕ Creando pizarra: ${name}`);

      // Primero crear el diagrama
      const { data: diagramData, error: diagramError } = await supabase
        .from('diagrams')
        .insert({
          name: `Diagrama - ${name}`,
          nodes: [],
          edges: [],
        })
        .select()
        .single();

      if (diagramError || !diagramData) {
        handleSupabaseError(diagramError, 'crear diagrama');
        throw new Error('Error creando diagrama');
      }

      // Generar un ID único para la board (usando timestamp + random)
      const boardId = `board_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      // Luego crear la pizarra
      const { data: boardData, error: boardError } = await supabase
        .from('boards')
        .insert({
          id: boardId,
          name,
          diagram_id: diagramData.id,
        })
        .select()
        .single();

      if (boardError || !boardData) {
        handleSupabaseError(boardError, 'crear pizarra');
        throw new Error('Error creando pizarra');
      }

      // Actualizar estado local
      setBoards(prev => [...prev, boardData]);

      console.log(`✅ Pizarra creada: ${boardData.id}`);
      return boardData.id;
    } catch (err) {
      console.error('❌ Error creando pizarra:', err);
      throw err;
    }
  }, []);

  // Eliminar pizarra
  const deleteBoard = useCallback(async (boardId: string): Promise<void> => {
    try {
      console.log(`🗑️ Eliminando pizarra: ${boardId}`);

      // Obtener la pizarra para encontrar el diagram_id
      const { data: boardData, error: fetchError } = await supabase
        .from('boards')
        .select('diagram_id')
        .eq('id', boardId)
        .single();

      if (fetchError || !boardData) {
        handleSupabaseError(fetchError, 'obtener pizarra');
        return;
      }

      // Eliminar pizarra
      const { error: boardError } = await supabase.from('boards').delete().eq('id', boardId);

      if (boardError) {
        handleSupabaseError(boardError, 'eliminar pizarra');
      }

      // Eliminar diagrama asociado
      const { error: diagramError } = await supabase
        .from('diagrams')
        .delete()
        .eq('id', boardData.diagram_id);

      if (diagramError) {
        handleSupabaseError(diagramError, 'eliminar diagrama');
      }

      // Actualizar estado local
      setBoards(prev => prev.filter(board => board.id !== boardId));

      console.log(`✅ Pizarra eliminada: ${boardId}`);
    } catch (err) {
      console.error('❌ Error eliminando pizarra:', err);
      throw err;
    }
  }, []);

  // Renombrar pizarra
  const renameBoard = useCallback(async (boardId: string, newName: string): Promise<void> => {
    try {
      console.log(`✏️ Renombrando pizarra: ${boardId} -> ${newName}`);

      const { error } = await supabase
        .from('boards')
        .update({ name: newName })
        .eq('id', boardId)
        .select()
        .single();

      if (error) {
        handleSupabaseError(error, 'renombrar pizarra');
      }

      // Actualizar estado local
      setBoards(prev =>
        prev.map(board => (board.id === boardId ? { ...board, name: newName } : board))
      );

      console.log(`✅ Pizarra renombrada: ${boardId}`);
    } catch (err) {
      console.error('❌ Error renombrando pizarra:', err);
      throw err;
    }
  }, []);

  // Cargar pizarras al montar el componente
  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  return {
    boards,
    isLoading,
    error,
    createBoard,
    deleteBoard,
    renameBoard,
    refreshBoards: loadBoards,
  };
}
