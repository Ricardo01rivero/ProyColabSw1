import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database.types';

interface SupabaseError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Configuración de Supabase - Credenciales del proyecto actual
const supabaseUrl = 'https://izsllyjacdhfeoexwpvh.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2xseWphY2RoZmVvZXh3cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwODk2NjQsImV4cCI6MjA3NjY2NTY2NH0.VYW4TKIdKLj2JcL3lxOCTBT6QwOhMrG_P6WWFSAnRDM';

// Crear cliente de Supabase con tipos
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Tipos de utilidad para el cliente
export type SupabaseClient = typeof supabase;

// Configuración de tiempo real
export const realtimeConfig = {
  heartbeatIntervalMs: 30000,
  timeoutMs: 10000,
};

// Utilidades de error
export const handleSupabaseError = (error: SupabaseError | Error | unknown, context: string) => {
  console.error(`❌ Error en ${context}:`, error);
  const message =
    error instanceof Error
      ? error.message
      : (error as SupabaseError)?.message || 'Error desconocido';
  throw new Error(`Error en ${context}: ${message}`);
};

export default supabase;
