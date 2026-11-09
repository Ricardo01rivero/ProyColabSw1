import React, { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const supabaseUrl = 'https://bwduexqzhjolwfxupvco.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3ZHVleHF6aGpvbHdmeHVwdmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5ODc3NzAsImV4cCI6MjA3NjU2Mzc3MH0.WQiWHEYBzsT0LAa5N3quDDiZlYzfOVz7lY86ZF02RjI';
const supabase = createClient(supabaseUrl, supabaseKey);

type UploadedImage = {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: Date;
};

const Debug = () => {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Función para subir archivo a Supabase
  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      // Generar nombre único para el archivo
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

      console.log(`📤 Subiendo archivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      // Subir archivo al bucket 'imagenes'
      const { data, error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Error al subir: ${uploadError.message}`);
      }

      console.log('✅ Archivo subido exitosamente:', data);

      // Obtener URL pública
      const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(fileName);

      const newImage: UploadedImage = {
        id: fileName,
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        uploadedAt: new Date(),
      };

      setImages(prev => [newImage, ...prev]);
      setSuccess(`✅ ${file.name} subido exitosamente`);
    } catch (err) {
      console.error('❌ Error en upload:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setUploading(false);
    }
  };

  // Función para cargar imágenes existentes
  const loadImages = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Cargando lista de archivos...');

      const { data, error: listError } = await supabase.storage.from('imagenes').list('', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

      if (listError) {
        throw new Error(`Error al listar: ${listError.message}`);
      }

      console.log(`📁 Encontrados ${data?.length || 0} archivos`);

      const imageList: UploadedImage[] = (data || []).map(file => {
        const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(file.name);

        return {
          id: file.name,
          name: file.name,
          url: urlData.publicUrl,
          size: file.metadata?.size || 0,
          uploadedAt: new Date(file.created_at || Date.now()),
        };
      });

      setImages(imageList);
    } catch (err) {
      console.error('❌ Error cargando imágenes:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // Función para eliminar archivo
  const deleteImage = async (fileName: string) => {
    try {
      setError(null);

      console.log(`🗑️ Eliminando archivo: ${fileName}`);

      const { error: deleteError } = await supabase.storage.from('imagenes').remove([fileName]);

      if (deleteError) {
        throw new Error(`Error al eliminar: ${deleteError.message}`);
      }

      setImages(prev => prev.filter(img => img.id !== fileName));
      setSuccess(`🗑️ ${fileName} eliminado exitosamente`);
    } catch (err) {
      console.error('❌ Error eliminando:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  // Manejador de selección de archivos
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];

      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        setError('❌ Solo se permiten archivos de imagen');
        return;
      }

      // Validar tamaño (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('❌ El archivo debe ser menor a 5MB');
        return;
      }

      uploadFile(file);
    }
  };

  // Función para formatear tamaño de archivo
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1 style={{ color: '#333', marginBottom: '10px' }}>🖼️ Demo Supabase Storage</h1>
        <p style={{ color: '#666', fontSize: '16px' }}>
          Prueba de subida, descarga y gestión de imágenes usando Supabase como servidor de archivos
          estáticos
        </p>
        <div
          style={{
            background: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px',
            margin: '15px 0',
            fontSize: '14px',
            color: '#555',
          }}
        >
          <strong>📡 Bucket:</strong> imagenes <br />
          <strong>🔗 URL:</strong> {supabaseUrl}
        </div>
      </div>

      {/* Controles */}
      <div
        style={{
          display: 'flex',
          gap: '15px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            background: uploading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '6px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
        >
          {uploading ? '⏳ Subiendo...' : '📤 Subir Imagen'}
        </button>

        <button
          onClick={loadImages}
          disabled={loading}
          style={{
            background: loading ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
        >
          {loading ? '⏳ Cargando...' : '🔄 Cargar Lista'}
        </button>

        {images.length > 0 && (
          <button
            onClick={async () => {
              try {
                const allUrls = images.map(img => `${img.name}: ${img.url}`).join('\n');
                await navigator.clipboard.writeText(allUrls);
                setSuccess(`📋 ${images.length} URLs copiadas al portapapeles`);
              } catch (err) {
                console.error('Error copiando URLs:', err);
                setError('❌ No se pudieron copiar las URLs');
              }
            }}
            style={{
              background: '#9C27B0',
              color: 'white',
              border: 'none',
              padding: '12px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
            title='Copiar todas las URLs con nombres de archivo'
          >
            📋 Copiar Todas las URLs
          </button>
        )}
      </div>

      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Mensajes de estado */}
      {error && (
        <div
          style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #ffcdd2',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: '#e8f5e8',
            color: '#2e7d32',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #c8e6c9',
          }}
        >
          {success}
        </div>
      )}

      {/* Grid de imágenes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
          marginTop: '20px',
        }}
      >
        {images.map(image => (
          <div
            key={image.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            {/* Imagen */}
            <div style={{ height: '200px', overflow: 'hidden' }}>
              <img
                src={image.url}
                alt={image.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
                onError={e => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f5f5f5;color:#999;">❌ Error cargando imagen</div>';
                }}
              />
            </div>

            {/* Info */}
            <div style={{ padding: '15px' }}>
              <h3
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  color: '#333',
                  wordBreak: 'break-all',
                }}
              >
                📄 {image.name}
              </h3>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                📏 {formatFileSize(image.size)}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                🕒 {image.uploadedAt.toLocaleString()}
              </p>

              {/* Botones */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  marginTop: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <a
                  href={image.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  style={{
                    background: '#4CAF50',
                    color: 'white',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontSize: '11px',
                    flex: '1 1 auto',
                    textAlign: 'center',
                    minWidth: '60px',
                  }}
                >
                  🔗 Ver
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(image.url);
                      setSuccess(`📋 URL copiada: ${image.name}`);
                    } catch (err) {
                      console.error('Error copiando URL:', err);
                      setError('❌ No se pudo copiar la URL');
                    }
                  }}
                  style={{
                    background: '#FF9800',
                    color: 'white',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    flex: '1 1 auto',
                    minWidth: '70px',
                  }}
                  title={`Copiar URL: ${image.url}`}
                >
                  📋 URL
                </button>
                <button
                  onClick={() => deleteImage(image.id)}
                  style={{
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    flex: '1 1 auto',
                    minWidth: '70px',
                  }}
                >
                  🗑️ Del
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Estado vacío */}
      {images.length === 0 && !loading && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#999',
            border: '2px dashed #ddd',
            borderRadius: '8px',
            marginTop: '20px',
          }}
        >
          <h3>📂 No hay imágenes</h3>
          <p>Sube una imagen o carga la lista para ver el contenido del bucket</p>
        </div>
      )}
    </div>
  );
};

export default Debug;
