export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      boards: {
        Row: {
          id: string;
          name: string;
          diagram_id: string;
          created_at: string;
          locked?: boolean;
        };
        Insert: {
          id: string;
          name: string;
          diagram_id: string;
          created_at?: string;
          locked?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          diagram_id?: string;
          created_at?: string;
          locked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'boards_diagram_id_fkey';
            columns: ['diagram_id'];
            isOneToOne: false;
            referencedRelation: 'diagrams';
            referencedColumns: ['id'];
          },
        ];
      };
      diagrams: {
        Row: {
          id: string;
          name: string;
          nodes: Json;
          edges: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          nodes?: Json;
          edges?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          nodes?: Json;
          edges?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          board_id: string;
          author: string;
          role: 'user' | 'assistant';
          content: string;
          reply_to_author: string | null;
          recipient: string | null;
          attachment_url: string | null;
          attachment_name: string | null;
          attachment_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          author: string;
          role: 'user' | 'assistant';
          content: string;
          reply_to_author?: string | null;
          recipient?: string | null;
          attachment_url?: string | null;
          attachment_name?: string | null;
          attachment_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          board_id?: string;
          author?: string;
          role?: 'user' | 'assistant';
          content?: string;
          reply_to_author?: string | null;
          recipient?: string | null;
          attachment_url?: string | null;
          attachment_name?: string | null;
          attachment_type?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_board_id_fkey';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'boards';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Tipos de utilidad para las tablas
export type Board = Database['public']['Tables']['boards']['Row'];
export type BoardInsert = Database['public']['Tables']['boards']['Insert'];
export type BoardUpdate = Database['public']['Tables']['boards']['Update'];

export type Diagram = Database['public']['Tables']['diagrams']['Row'];
export type DiagramInsert = Database['public']['Tables']['diagrams']['Insert'];
export type DiagramUpdate = Database['public']['Tables']['diagrams']['Update'];

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];

// Tipos específicos para ReactFlow basados en la estructura actual
export interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    attributes?: Array<{
      id: string;
      name: string;
      type: string;
      scope: string;
    }>;
    asociativa?: boolean;
    relaciona?: string[];
  };
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: {
    edgeType?: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
  };
}
