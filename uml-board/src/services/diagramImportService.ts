/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeType, EdgeType } from '../utils/umlConstants';

// Supabase y proxy de OpenAI (centralizados en supabase.config)
import { supabase, OPENAI_PROXY_URL, SUPABASE_ANON_KEY } from '../lib/supabase.config';

// Tipos para el análisis OpenAI
type OpenAIClass = {
  name: string;
  attributes: Array<{
    name: string;
    type: string;
    visibility: 'public' | 'private' | 'protected';
  }>;
  methods: Array<{
    name: string;
    returnType: string;
    parameters: Array<any>;
    visibility: 'public' | 'private' | 'protected';
  }>;
};

type OpenAIRelationship = {
  type: 'association' | 'inheritance' | 'composition' | 'aggregation';
  source: string;
  target: string;
  sourceMultiplicity?: string; // Multiplicidad en el extremo source
  targetMultiplicity?: string; // Multiplicidad en el extremo target
};

type OpenAIResponse = {
  classes: OpenAIClass[];
  relationships: OpenAIRelationship[];
};

type AnalysisResult = {
  success: boolean;
  nodes?: NodeType[];
  edges?: EdgeType[];
  error?: string;
  cost?: number;
};

/**
 * Convierte la respuesta de OpenAI al formato esperado por umlConstants
 */
function convertOpenAIToUMLConstants(openaiData: OpenAIResponse): {
  nodes: NodeType[];
  edges: EdgeType[];
} {
  const nodes: NodeType[] = [];
  const edges: EdgeType[] = [];

  console.log('� Creando nodos...');

  // Crear nodos
  const startX = 100;
  const startY = 100;
  const spacingX = 300;
  const spacingY = 400;
  const cols = 3;

  // Generar timestamp único para evitar colisiones de IDs
  const timestamp = Date.now();
  let nodeCounter = 1;
  let edgeCounter = 1;

  openaiData.classes.forEach((cls, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const node: NodeType = {
      id: `imported_${timestamp}_n${nodeCounter++}`,
      label: cls.name,
      x: startX + col * spacingX,
      y: startY + row * spacingY,
      // Filtrar atributos 'id' ya que se asumen implícitamente
      attributes: cls.attributes
        .filter(attr => attr.name.toLowerCase() !== 'id')
        .map(attr => ({
          name: attr.name,
          scope: (attr.visibility as 'public' | 'private' | 'protected') || 'private', // Default a 'private' si no se especifica
          datatype: mapOpenAITypeToUMLType(attr.type || 'String'), // Default a 'String' si no se especifica
        })),
    };

    // Calcular altura basada en atributos
    const ATTR_HEIGHT = 28;
    const NODE_HEIGHT = 120;
    node.height = NODE_HEIGHT + (node.attributes?.length || 0) * ATTR_HEIGHT;

    nodes.push(node);
    console.log(`📝 Creado nodo: ${cls.name} (ID: ${node.id})`);
  });

  // Crear un mapa de nombres de clases a IDs
  const classNameToId = new Map<string, string>();
  nodes.forEach(node => {
    classNameToId.set(node.label, node.id);
  });

  // FILTRAR RELACIONES DUPLICADAS BIDIRECCIONALES Y CORREGIR DIRECCIONALIDAD
  console.log('🔧 Filtrando relaciones duplicadas y corrigiendo direccionalidad...');
  const uniqueRelationships: any[] = [];
  const seenRelations = new Set<string>();

  for (const rel of openaiData.relationships) {
    // Aplicar corrección semántica de direccionalidad
    const correctedRel = correctRelationshipDirection(rel);

    // Crear clave normalizada para detectar duplicados bidireccionales
    const key1 = `${correctedRel.source}-${correctedRel.target}`;
    const key2 = `${correctedRel.target}-${correctedRel.source}`;

    // Si no hemos visto ninguna de las dos direcciones, agregar la relación
    if (!seenRelations.has(key1) && !seenRelations.has(key2)) {
      uniqueRelationships.push(correctedRel);
      seenRelations.add(key1);
    }
  }

  console.log(
    `📊 Relaciones originales: ${openaiData.relationships.length}, únicas: ${uniqueRelationships.length}`
  );

  // ALGORITMO DE INFERENCIA: Detectar relaciones faltantes para tablas intermedias
  console.log('🔧 Verificando relaciones faltantes para tablas intermedias...');

  // Buscar tablas que sigan patrones de entidades intermedias
  const intermediateEntities = openaiData.classes.filter(cls => {
    const name = cls.name.toLowerCase();
    return (
      name.startsWith('detalle') ||
      name.includes('intermedia') ||
      name.includes('relacion') ||
      name.includes('asociacion') ||
      name.includes('inscripcion') ||
      name.includes('union') ||
      name.includes('conexion')
    );
  });

  intermediateEntities.forEach(intermediateEntity => {
    const entityName = intermediateEntity.name;
    console.log(`🔍 Verificando entidad intermedia: ${entityName}...`);

    // Buscar todas las conexiones a esta entidad
    const connectionsToEntity = uniqueRelationships.filter(
      rel => rel.target === entityName || rel.source === entityName
    );

    console.log(`   Conexiones encontradas: ${connectionsToEntity.length}`);
    connectionsToEntity.forEach(conn => {
      console.log(`      ${conn.source} → ${conn.target}`);
    });

    // Si tiene solo 1 conexión, intentar inferir la segunda
    if (connectionsToEntity.length === 1) {
      const existingConnection = connectionsToEntity[0];
      const connectedEntity =
        existingConnection.source === entityName
          ? existingConnection.target
          : existingConnection.source;

      console.log(`   ⚠️ ${entityName} solo tiene 1 conexión con ${connectedEntity}`);

      // INFERENCIA UNIVERSAL: Buscar entidades principales comunes
      let inferredEntity = null;

      // Buscar entidades que podrían ser la segunda conexión
      const commonEntityPatterns = [
        'producto',
        'item',
        'articulo',
        'elemento',
        'objeto',
        'usuario',
        'cliente',
        'persona',
        'agente',
        'servicio',
        'tarea',
        'actividad',
        'operacion',
        'documento',
        'archivo',
        'registro',
        'entrada',
        'categoria',
        'tipo',
        'clase',
        'grupo',
      ];

      // Buscar por patrones comunes en las entidades disponibles
      for (const pattern of commonEntityPatterns) {
        const candidate = openaiData.classes.find(
          cls =>
            cls.name.toLowerCase().includes(pattern) &&
            cls.name !== entityName &&
            cls.name !== connectedEntity
        );

        if (candidate) {
          inferredEntity = candidate.name;
          break;
        }
      }

      // Si no se encontró por patrones, buscar la entidad más mencionada
      if (!inferredEntity) {
        const entityFrequency = new Map<string, number>();
        openaiData.classes.forEach(cls => {
          if (cls.name !== entityName && cls.name !== connectedEntity) {
            entityFrequency.set(cls.name, 0);
          }
        });

        // Contar referencias en otras relaciones
        uniqueRelationships.forEach(rel => {
          if (entityFrequency.has(rel.source)) {
            entityFrequency.set(rel.source, entityFrequency.get(rel.source)! + 1);
          }
          if (entityFrequency.has(rel.target)) {
            entityFrequency.set(rel.target, entityFrequency.get(rel.target)! + 1);
          }
        });

        // Seleccionar la entidad más referenciada
        let maxCount = 0;
        for (const [entity, count] of entityFrequency.entries()) {
          if (count > maxCount) {
            maxCount = count;
            inferredEntity = entity;
          }
        }
      }

      if (inferredEntity && openaiData.classes.some(cls => cls.name === inferredEntity)) {
        // Verificar que no existe ya esta relación
        const relationExists = uniqueRelationships.some(
          rel =>
            (rel.source === inferredEntity && rel.target === entityName) ||
            (rel.source === entityName && rel.target === inferredEntity)
        );

        if (!relationExists) {
          console.log(
            `   ✅ Agregando relación inferida: ${inferredEntity} → ${entityName} (inferencia universal)`
          );
          uniqueRelationships.push({
            type: 'association',
            source: inferredEntity,
            target: entityName,
            multiplicity: '1..*',
          });
        }
      } else {
        console.log(`   ⚠️ No se pudo inferir segunda relación para ${entityName}`);
      }
    }
  });

  console.log(`📊 Relaciones después de inferencia: ${uniqueRelationships.length}`);

  // Identificar tablas intermedias/asociativas de manera universal
  const processedRelationships = new Set<string>();

  console.log('🔍 Identificando patrones de relaciones M:N...');

  // ALGORITMO ROBUSTO: Detectar tablas asociativas de manera universal
  nodes.forEach(candidateNode => {
    const candidateName = candidateNode.label;

    // PASO 1: Buscar todas las relaciones conectadas a este candidato (usando relaciones únicas)
    const incomingRels = uniqueRelationships.filter(rel => rel.target === candidateName);
    const outgoingRels = uniqueRelationships.filter(rel => rel.source === candidateName);
    const allConnectedRels = [...incomingRels, ...outgoingRels];

    console.log(`� Analizando candidato: ${candidateName}`);
    console.log(
      `   Relaciones conectadas: ${allConnectedRels.length} (${incomingRels.length} entrantes, ${outgoingRels.length} salientes)`
    );

    // PASO 2: CRITERIO PRINCIPAL - Nombre típico de tabla intermedia
    const isDetalleEntity = candidateName.toLowerCase().startsWith('detalle');
    const isIntermediaEntity = [
      'intermedia',
      'relacion',
      'inscripcion',
      'asociacion',
      'union',
    ].some(word => candidateName.toLowerCase().includes(word));

    // PASO 3: Solo procesar si tiene nombre típico de tabla intermedia
    if (!isDetalleEntity && !isIntermediaEntity) {
      console.log(`   ❌ No es tabla intermedia: "${candidateName}" no tiene patrón típico`);
      return; // Saltar este candidato
    }

    console.log(`   ✅ Candidato válido: "${candidateName}" tiene patrón de tabla intermedia`);

    // PASO 4: Identificar entidades únicas conectadas (no número de relaciones)
    const connectedEntities = new Set<string>();
    allConnectedRels.forEach(rel => {
      if (rel.source === candidateName) {
        connectedEntities.add(rel.target);
      } else {
        connectedEntities.add(rel.source);
      }
    });

    const entityArray = Array.from(connectedEntities);
    console.log(
      `   🎯 Entidades únicas conectadas: ${entityArray.length} (${entityArray.join(', ')})`
    );

    // PASO 5: Debe conectar exactamente 2 entidades principales
    if (entityArray.length !== 2) {
      console.log(
        `   ❌ Rechazado: conecta ${entityArray.length} entidades únicas (debe ser exactamente 2)`
      );
      return;
    }

    const [entityA, entityB] = entityArray;
    console.log(`   🎯 Entidades conectadas: ${entityA} ↔ ${entityB}`);

    // PASO 6: Verificar que las entidades conectadas NO sean tablas intermedias
    const entityAIsIntermediate =
      entityA.toLowerCase().startsWith('detalle') ||
      ['intermedia', 'relacion', 'inscripcion'].some(word => entityA.toLowerCase().includes(word));
    const entityBIsIntermediate =
      entityB.toLowerCase().startsWith('detalle') ||
      ['intermedia', 'relacion', 'inscripcion'].some(word => entityB.toLowerCase().includes(word));

    if (entityAIsIntermediate || entityBIsIntermediate) {
      console.log(`   ❌ Rechazado: una de las entidades conectadas también es intermedia`);
      console.log(`      ${entityA}: ${entityAIsIntermediate ? 'intermedia' : 'principal'}`);
      console.log(`      ${entityB}: ${entityBIsIntermediate ? 'intermedia' : 'principal'}`);
      return;
    }

    // PASO 7: DETECTADA TABLA ASOCIATIVA VÁLIDA
    const entityIdA = classNameToId.get(entityA);
    const entityIdB = classNameToId.get(entityB);

    if (!entityIdA || !entityIdB) {
      console.log(
        `   ❌ Error: IDs no encontrados para ${entityA} (${entityIdA}) o ${entityB} (${entityIdB})`
      );
      return;
    }

    console.log(`🎉 TABLA ASOCIATIVA DETECTADA: ${candidateName}`);
    console.log(`   Conecta: ${entityA} ↔ ${entityB}`);

    // PASO 8: Configurar tabla asociativa (patrón exacto del sistema manual)
    candidateNode.asociativa = true;
    candidateNode.relaciona = [entityIdA, entityIdB];

    // PASO 9: Crear las 2 relaciones M:N (EntidadA → Tabla, EntidadB → Tabla)
    const edgeA = {
      id: `imported_${timestamp}_e${edgeCounter++}`,
      source: entityIdA,
      target: candidateNode.id,
      tipo: 'asociacion' as const,
      multiplicidadOrigen: '1' as const,
      multiplicidadDestino: '*' as const,
    };
    edges.push(edgeA);

    const edgeB = {
      id: `imported_${timestamp}_e${edgeCounter++}`,
      source: entityIdB,
      target: candidateNode.id,
      tipo: 'asociacion' as const,
      multiplicidadOrigen: '1' as const,
      multiplicidadDestino: '*' as const,
    };
    edges.push(edgeB);

    // PASO 10: Marcar relaciones como procesadas
    allConnectedRels.forEach(rel => {
      processedRelationships.add(`${rel.source}-${rel.target}`);
      processedRelationships.add(`${rel.target}-${rel.source}`);
    });

    console.log(`   ✅ Configuración completada:`);
    console.log(`      - Tabla: ${candidateName} (asociativa: true)`);
    console.log(`      - Relaciona: [${entityA}, ${entityB}]`);
    console.log(`      - Edge A: ${entityA} → ${candidateName} (${edgeA.id})`);
    console.log(`      - Edge B: ${entityB} → ${candidateName} (${edgeB.id})`);
    console.log(`      - Total edges: ${edges.length}`);
  });

  console.log('🔗 Procesando relaciones directas...');
  console.log(`📋 Total relaciones únicas para procesar: ${uniqueRelationships.length}`);

  // Crear mapa de entidades conectadas vía M:N para evitar relaciones directas duplicadas
  const mnConnectedEntities = new Set<string>();
  nodes
    .filter(n => n.asociativa && n.relaciona)
    .forEach(tableNode => {
      const [idA, idB] = tableNode.relaciona!;
      const nameA = nodes.find(n => n.id === idA)?.label;
      const nameB = nodes.find(n => n.id === idB)?.label;
      if (nameA && nameB) {
        mnConnectedEntities.add(`${nameA}-${nameB}`);
        mnConnectedEntities.add(`${nameB}-${nameA}`); // Ambas direcciones
        console.log(`📝 M:N registrado: ${nameA} ↔ ${nameB} (evitar relaciones directas)`);
      }
    });

  // Procesar relaciones directas (no M:N)
  uniqueRelationships.forEach((rel, idx) => {
    const relKey = `${rel.source}-${rel.target}`;

    console.log(
      `🔗 Relación ${idx + 1}: ${rel.source} → ${rel.target} (${rel.type}) mult: [${rel.sourceMultiplicity || '1'}:${rel.targetMultiplicity || '1'}]`
    );

    if (processedRelationships.has(relKey)) {
      console.log(`  ⏭️ Saltando - ya procesada como M:N: ${relKey}`);
      return;
    }

    // NUEVA VERIFICACIÓN: Evitar relaciones directas entre entidades conectadas vía M:N
    if (mnConnectedEntities.has(`${rel.source}-${rel.target}`)) {
      console.log(`  ⏭️ Saltando - existe relación M:N: ${rel.source} ↔ ${rel.target}`);
      return;
    }

    const sourceId = classNameToId.get(rel.source);
    const targetId = classNameToId.get(rel.target);

    if (!sourceId || !targetId) {
      console.log(
        `  ❌ Error: No se encontraron IDs para ${rel.source} (${sourceId}) → ${rel.target} (${targetId})`
      );
      return;
    }

    // Parsear multiplicidades de cada extremo
    const origen = parseSingleMultiplicity(rel.sourceMultiplicity);
    const destino = parseSingleMultiplicity(rel.targetMultiplicity);

    const edge: EdgeType = {
      id: `imported_${timestamp}_e${edgeCounter++}`,
      source: sourceId,
      target: targetId,
      tipo: mapOpenAIRelationType(rel.type),
      multiplicidadOrigen: origen,
      multiplicidadDestino: destino,
    };

    edges.push(edge);
    console.log(
      `  ✅ Relación directa agregada: ${rel.source} → ${rel.target} (${edge.tipo}) [${origen}:${destino}]`
    );
  });

  console.log(`✅ Conversión completada: ${nodes.length} nodos, ${edges.length} relaciones`);

  // Resumen de detección M:N
  const associativeNodes = nodes.filter(n => n.asociativa);
  console.log(`📊 RESUMEN FINAL:`);
  console.log(`   - Entidades principales: ${nodes.filter(n => !n.asociativa).length}`);
  console.log(`   - Tablas asociativas (M:N): ${associativeNodes.length}`);
  console.log(`   - Relaciones totales: ${edges.length}`);

  if (associativeNodes.length > 0) {
    console.log(`🔗 RELACIONES M:N DETECTADAS:`);
    associativeNodes.forEach(node => {
      const [id1, id2] = node.relaciona || [];
      const name1 = nodes.find(n => n.id === id1)?.label;
      const name2 = nodes.find(n => n.id === id2)?.label;
      console.log(`   - ${name1} ↔ ${name2} vía ${node.label}`);
    });
  }

  console.log('=======================================');

  return { nodes, edges };
}

/**
 * Mapea tipos de OpenAI a tipos UML
 */
function mapOpenAITypeToUMLType(
  openaiType: string
): 'Integer' | 'Float' | 'Boolean' | 'Date' | 'String' {
  const type = openaiType.toLowerCase();

  if (type.includes('int') || type.includes('number') || type === 'long') {
    return 'Integer';
  }
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) {
    return 'Float';
  }
  if (type.includes('bool')) {
    return 'Boolean';
  }
  if (type.includes('date') || type.includes('time')) {
    return 'Date';
  }

  return 'String'; // Por defecto
}

/**
 * Mapea tipos de relación de OpenAI a tipos UML
 */
function mapOpenAIRelationType(
  openaiType: string
): 'asociacion' | 'agregacion' | 'composicion' | 'herencia' | 'dependencia' {
  const type = openaiType.toLowerCase().trim();

  console.log(`🔄 Mapeando tipo de relación: "${openaiType}" → "${type}"`);

  switch (type) {
    case 'inheritance':
    case 'extends':
    case 'inherits':
    case 'generalization':
    case 'is-a':
      console.log(`  → Detectada HERENCIA`);
      return 'herencia';

    case 'composition':
    case 'composite':
    case 'part-of':
    case 'contains':
      console.log(`  → Detectada COMPOSICIÓN`);
      return 'composicion';

    case 'aggregation':
    case 'aggregate':
    case 'has-a':
    case 'whole-part':
      console.log(`  → Detectada AGREGACIÓN`);
      return 'agregacion';

    case 'dependency':
    case 'depends':
    case 'uses':
      console.log(`  → Detectada DEPENDENCIA`);
      return 'dependencia';

    case 'association':
    case 'associates':
    case 'relates':
    default:
      console.log(`  → Detectada ASOCIACIÓN (por defecto)`);
      return 'asociacion';
  }
}

/**
 * Parsea multiplicidad individual de un extremo
 */
function parseSingleMultiplicity(mult?: string): '1' | '*' {
  if (!mult) return '1';
  
  const m = mult.toLowerCase().trim();
  
  // Detectar multiplicidades múltiples
  if (m === '*' || m === '0..*' || m === '1..*' || m.includes('many') || m.includes('n')) {
    return '*';
  }
  
  // Casos específicos 1
  if (m === '1' || m === '1..1' || m === '0..1') {
    return '1';
  }
  
  // Por defecto uno
  return '1';
}

/**
 * Corrige la direccionalidad de relaciones basándose en patrones semánticos universales
 */
function correctRelationshipDirection(rel: OpenAIRelationship): OpenAIRelationship {
  const source = rel.source.toLowerCase();
  const target = rel.target.toLowerCase();

  console.log(`🔍 Evaluando relación: ${rel.source} → ${rel.target}`);

  // PATRONES UNIVERSALES DE CORRECCIÓN SEMÁNTICA (evaluados individualmente)
  const universalPatterns = [
    // Patrón 1: Entidad clasificadora → Entidad clasificada
    {
      name: 'Clasificación',
      sourcePattern: /^(categor[ií]a|tipo|clase|clasificaci[oó]n|grupo|familia)$/,
      targetPattern: /^(producto|item|elemento|articulo|objeto)$/,
      needsCorrection: false, // Ya está en dirección correcta
      reason: 'Una entidad clasificadora contiene múltiples elementos clasificados',
    },

    // Patrón 2: Entidad principal → Entidad de detalle
    {
      name: 'Principal-Detalle',
      sourcePattern: /^(venta|compra|factura|pedido|orden|documento)$/,
      targetPattern: /^detalle.+$/,
      needsCorrection: false,
      reason: 'Una entidad principal contiene múltiples detalles',
    },

    // Patrón 3: Actor → Acción (entidades que representan acciones/transacciones)
    {
      name: 'Actor-Acción',
      sourcePattern: /^(cliente|usuario|persona|empleado|proveedor|vendedor|comprador)$/,
      targetPattern: /^(venta|compra|pedido|orden|transacci[oó]n|operaci[oó]n|solicitud)$/,
      needsCorrection: false,
      reason: 'Un actor realiza múltiples acciones',
    },

    // Patrón 4: Producto → Entidad de detalle (para M:N)
    {
      name: 'Producto-Detalle',
      sourcePattern: /^(producto|item|articulo|elemento|servicio)$/,
      targetPattern: /^detalle.+$/,
      needsCorrection: false,
      reason: 'Un producto aparece en múltiples detalles',
    },
  ];

  // Evaluar cada patrón individualmente
  for (const pattern of universalPatterns) {
    const sourceMatches = pattern.sourcePattern.test(source);
    const targetMatches = pattern.targetPattern.test(target);
    const reverseSourceMatches = pattern.sourcePattern.test(target);
    const reverseTargetMatches = pattern.targetPattern.test(source);

    if (sourceMatches && targetMatches) {
      // Dirección correcta según el patrón
      console.log(`   ✅ Patrón ${pattern.name}: dirección correcta (${pattern.reason})`);
      return rel;
    } else if (reverseSourceMatches && reverseTargetMatches) {
      // Dirección invertida - corregir
      console.log(`   🔄 Patrón ${pattern.name}: invirtiendo dirección (${pattern.reason})`);
      return {
        ...rel,
        source: rel.target,
        target: rel.source,
      };
    }
  }

  // ANÁLISIS HEURÍSTICO ADICIONAL para casos no cubiertos por patrones específicos

  // Heurística 1: Nombres más generales → Nombres más específicos
  if (source.length < target.length && target.includes(source)) {
    console.log(
      `   🔄 Heurística especificidad: ${rel.source} → ${rel.target} INVERTIDA (entidad general → específica)`
    );
    return {
      ...rel,
      source: rel.target,
      target: rel.source,
    };
  }

  // Heurística 2: Entidades singulares → Entidades plurales (si detectables)
  const sourceIsPlural = source.endsWith('s') || source.endsWith('es');
  const targetIsPlural = target.endsWith('s') || target.endsWith('es');

  if (!sourceIsPlural && targetIsPlural) {
    console.log(
      `   🔄 Heurística cardinalidad: ${rel.source} → ${rel.target} INVERTIDA (singular → plural)`
    );
    return {
      ...rel,
      source: rel.target,
      target: rel.source,
    };
  }

  // Si no hay corrección aplicable, mantener como está
  console.log(`   ➡️ Sin corrección aplicable: manteniendo ${rel.source} → ${rel.target}`);
  return rel;
}

/**
 * Sube una imagen a Supabase y retorna la URL pública
 */
async function uploadImageToSupabase(file: File): Promise<string> {
  // Validar archivo
  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten archivos de imagen');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('El archivo debe ser menor a 5MB');
  }

  // Generar nombre único
  const fileExt = file.name.split('.').pop();
  const fileName = `diagram_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

  console.log(`📤 Subiendo imagen: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  // Subir archivo
  const { error } = await supabase.storage.from('imagenes').upload(fileName, file);

  if (error) {
    throw new Error(`Error al subir imagen: ${error.message}`);
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage.from('imagenes').getPublicUrl(fileName);

  console.log(`✅ Imagen subida exitosamente: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}

/**
 * Analiza una imagen usando OpenAI Vision API
 */
async function analyzeImageWithOpenAI(imageUrl: string): Promise<OpenAIResponse> {
  const prompt = `Analiza este diagrama de clases UML y extrae ÚNICAMENTE la estructura en formato JSON válido.

RESPONDE SOLO CON EL JSON, sin explicaciones adicionales.

INSTRUCCIONES CRÍTICAS PARA RELACIONES M:N:
- EXAMINA CUIDADOSAMENTE TODAS LAS LÍNEAS del diagrama
- DETECTA TODAS las relaciones, especialmente relaciones muchos-a-muchos (M:N)
- IDENTIFICA tablas intermedias/asociativas que conectan entidades principales
- NO incluyas atributos "id" en las clases, se asumen implícitamente
- Para multiplicidades usa formato exacto: "1", "*", "0..*", "1..*"

⚠️ ANÁLISIS OBLIGATORIO DE CADA TABLA INTERMEDIA:
Para CADA entidad que empiece con "Detalle" (DetalleVenta, DetalleCompra, etc.):
1. BUSCA TODAS las líneas que conectan con esa entidad
2. VERIFICA que tenga conexiones a EXACTAMENTE 2 entidades principales
3. SI ves solo 1 conexión, BUSCA MÁS CUIDADOSAMENTE la segunda línea
4. EJEMPLO: DetalleCompra debe conectar con Compra Y con Producto

ANÁLISIS SISTEMÁTICO REQUERIDO:
1. IDENTIFICA todas las clases/entidades en el diagrama
2. DETECTA qué entidades son principales vs intermedias/asociativas
3. ENCUENTRA todas las líneas que conectan clases (no omitas ninguna línea, por pequeña que sea)
4. DETERMINA multiplicidades de cada relación con precisión
5. CLASIFICA cada relación según su tipo UML
6. VERIFICA que cada línea visible se convierta en una relación en el JSON

⚠️ INSTRUCCIÓN CRÍTICA: EXAMINA CADA LÍNEA DEL DIAGRAMA
- Busca líneas sólidas que conecten cajas de entidades
- Incluye líneas cortas, largas, horizontales, verticales, diagonales
- No omitas líneas que parezcan menos prominentes visualmente
- Cada línea visible debe resultar en una relación en el JSON
- Si ves una caja conectada a otra caja, debe existir una relación

DETECCIÓN ESPECIAL DE RELACIONES M:N:
Las relaciones muchos-a-muchos se pueden representar de 2 formas:
A) LÍNEA DIRECTA con multiplicidad * en ambos lados
B) VÍA TABLA INTERMEDIA: EntidadA → TablaIntermedia ← EntidadB

REGLA CRÍTICA PARA TABLAS INTERMEDIAS:
- Si ves una entidad con nombre como "Detalle[Algo]", "Intermedia", etc.
- Esa entidad debe estar conectada a EXACTAMENTE 2 entidades principales
- CADA conexión debe tener multiplicidad * (muchos)
- EJEMPLO: DetalleVenta debe conectar con Venta Y con Producto
- EJEMPLO: DetalleCompra debe conectar con Compra Y con Producto

PARA CADA TABLA INTERMEDIA DETECTADA, crear 2 relaciones:
- EntidadPrincipal1 → TablaIntermedia (multiplicidad 1..*)
- EntidadPrincipal2 → TablaIntermedia (multiplicidad 1..*)
- NO crear relación directa entre EntidadPrincipal1 y EntidadPrincipal2

NOMBRES TÍPICOS DE TABLAS INTERMEDIAS:
- Detalle + NombreEntidad: "DetalleVenta", "DetalleCompra", "DetallePedido"
- Nombres compuestos: "EstudianteCurso", "UsuarioRol", "ProductoCategoria"
- Palabras clave: "intermedia", "relacion", "inscripcion", "asociacion"

CRITERIOS DE CLASIFICACIÓN:
- ENTIDAD PRINCIPAL: Tiene atributos de negocio significativos, puede existir independientemente
- TABLA INTERMEDIA: Principalmente contiene claves foráneas + algunos atributos adicionales

PATRONES DE RELACIONES Y DETECCIÓN VISUAL:

⚠️ CRUCIAL: IDENTIFICAR TIPO DE RELACIÓN POR ELEMENTOS VISUALES:

1. **ASOCIACIÓN** (type: "association"):
   - Línea simple/recta entre entidades
   - Sin símbolos especiales en los extremos
   - Puede tener multiplicidad (1, *, 1..*, 0..*)
   - Es el tipo MÁS COMÚN en diagramas de clases

2. **HERENCIA/GENERALIZACIÓN** (type: "inheritance"):
   - Línea con FLECHA CON TRIÁNGULO VACÍO (hueco) ►
   - El triángulo apunta hacia la clase padre/superclase
   - Representa relación "es-un" (is-a)
   - Ejemplos: Persona ← Empleado, Vehiculo ← Auto

3. **COMPOSICIÓN** (type: "composition"):
   - Línea con ROMBO NEGRO/RELLENO ♦ en un extremo
   - Relación "parte-de" FUERTE (si se elimina el todo, se eliminan las partes)
   - ⚠️ CRÍTICO: El rombo está en la clase CONTENEDORA (el TODO)
   - ⚠️ DIRECCIÓN: Contenedor ♦──→ Parte (el rombo va en el contenedor)
   - Ejemplos: Casa ♦─→ Habitación, Auto ♦─→ Motor
   - source = clase con rombo (contenedor), target = clase contenida (parte)

4. **AGREGACIÓN** (type: "aggregation"):
   - Línea con ROMBO BLANCO/VACÍO ◊ en un extremo
   - Relación "parte-de" DÉBIL (las partes pueden existir independientemente)
   - ⚠️ CRÍTICO: El rombo está en la clase CONTENEDORA (el TODO)
   - ⚠️ DIRECCIÓN: Contenedor ◊──→ Elemento (el rombo va en el contenedor)
   - Ejemplos: Universidad ◊─→ Estudiante, Equipo ◊─→ Jugador
   - source = clase con rombo (contenedor), target = clase contenida (elemento)

INSTRUCCIONES CRÍTICAS PARA DETECCIÓN:
- EXAMINA CUIDADOSAMENTE los extremos de cada línea
- BUSCA símbolos específicos: triángulos (►), rombos rellenos (♦), rombos vacíos (◊)
- Si NO VES ningún símbolo especial → type: "association"
- Si VES triángulo vacío/hueco → type: "inheritance" 
- Si VES rombo negro/relleno → type: "composition"
- Si VES rombo blanco/vacío → type: "aggregation"

EJEMPLOS VISUALES A BUSCAR:
- ASOCIACIÓN: ClaseA ------0..*------ ClaseB (línea simple)
- HERENCIA: ClasePadre <──── ClaseHija (triángulo vacío apunta al padre)
- COMPOSICIÓN: Contenedor ♦──→ Parte (rombo RELLENO en contenedor)
- AGREGACIÓN: Contenedor ◊──→ Elemento (rombo VACÍO en contenedor)

⚠️ INSTRUCCIÓN CRÍTICA PARA COMPOSICIÓN Y AGREGACIÓN:
- IDENTIFICA qué lado tiene el rombo (♦ o ◊)
- La clase con el rombo ES EL SOURCE (contenedor/todo)
- La clase SIN rombo ES EL TARGET (parte/elemento)
- Ejemplo: Si ves "Categoría ◊────── Producto", entonces:
  * source = "Categoría" (tiene el rombo)
  * target = "Producto" (sin rombo)
  * type = "aggregation"

⚠️ INSTRUCCIÓN CRÍTICA PARA MULTIPLICIDADES:
- Lee EXACTAMENTE las multiplicidades escritas en cada extremo de la línea
- "0..*" = muchos (usa "0..*" en el JSON)
- "1..*" = uno o más (usa "1..*" en el JSON)
- "*" = muchos (usa "*" en el JSON)
- "1" = uno exactamente (usa "1" en el JSON)
- "0..1" = cero o uno (usa "0..1" en el JSON)
- NO ASUMAS multiplicidades, LÉELAS del diagrama

EJEMPLOS DE MULTIPLICIDADES:
- Producto 0..*──────1 Categoría → {source: "Producto", target: "Categoría", multiplicity: "0..*"}
- Venta 1──────* DetalleVenta → {source: "Venta", target: "DetalleVenta", multiplicity: "1..*"}
- Cliente 1──────0..* Pedido → {source: "Cliente", target: "Pedido", multiplicity: "0..*"}

REGLAS DE MAPEO:
- Línea simple sin símbolos = "association"
- Flecha con triángulo = "inheritance" 
- Rombo negro/relleno = "composition"
- Rombo blanco/vacío = "aggregation"
- En caso de duda = "association" (más seguro)

REGLAS CRÍTICAS PARA RELACIONES Y DIRECCIONALIDAD:
- NUNCA crear relaciones bidireccionales duplicadas (A→B y B→A)
- Cada línea del diagrama = UNA relación en el JSON
- Para relaciones M:N intermedias: crear solo A→Intermedia y B→Intermedia (NO Intermedia→A ni Intermedia→B)
- Direccionalidad: seguir la lógica semántica universal:

PATRONES UNIVERSALES DE DIRECCIONALIDAD:
1. CLASIFICACIÓN: Clasificador → Clasificado
   * Ejemplos: Categoría → Producto, Tipo → Item, Clase → Elemento
   
2. AGREGACIÓN: Contenedor → Contenido  
   * Ejemplos: Pedido → Detalle, Factura → Item, Proyecto → Tarea
   
3. JERARQUÍA: Superior → Subordinado
   * Ejemplos: Empresa → Empleado, Departamento → Usuario
   
4. TEMPORALIDAD: Actor → Acción
   * Ejemplos: Cliente → Venta, Usuario → Operación, Proveedor → Suministro
   
5. COMPOSICIÓN: Principal → Parte
   * Ejemplos: Documento → Sección, Sistema → Módulo

CORRECCIONES SEMÁNTICAS UNIVERSALES:
- Entidad clasificadora (categoría, tipo, clase) → Entidad clasificada
- Entidad principal → Entidad de detalle (que empiece con "Detalle")  
- Actor (persona, usuario, cliente) → Acción (venta, compra, operación)
- Contenedor (pedido, factura, documento) → Contenido (item, producto, sección)
- Las multiplicidades deben reflejar la lógica del dominio

VERIFICACIÓN OBLIGATORIA DE TIPOS DE RELACIÓN:
- ¿Examinaste los EXTREMOS de cada línea buscando símbolos?
- ¿Detectaste triángulos vacíos para herencia?
- ¿Identificaste rombos rellenos para composición?
- ¿Encontraste rombos vacíos para agregación?
- ¿Clasificaste correctamente cada tipo de relación?
- ¿Usaste "association" solo para líneas simples sin símbolos?

VERIFICACIÓN OBLIGATORIA M:N:
- ¿Detectaste todas las líneas con multiplicidad *?
- ¿Identificaste correctamente las tablas intermedias?
- ¿Las tablas intermedias conectan exactamente 2 entidades principales?
- ¿Evitaste duplicar relaciones en ambas direcciones?
- ⚠️ ¿CADA tabla "Detalle*" o intermedia tiene EXACTAMENTE 2 conexiones?
- ¿Las direcciones de relaciones siguen patrones semánticos universales?
- ¿Las multiplicidades son lógicamente consistentes?

PATRONES UNIVERSALES DE VERIFICACIÓN:
- Clasificador → Clasificado (Ej: Categoría → Item, Tipo → Elemento)
- Contenedor → Contenido (Ej: Orden → Detalle, Documento → Sección)  
- Actor → Acción (Ej: Usuario → Operación, Agente → Transacción)
- Principal → Subordinado (Ej: Empresa → Empleado, Sistema → Módulo)
- Temporal → Entidad (Ej: Período → Evento, Fecha → Registro)

Formato requerido:
{
  "classes": [
    {
      "name": "NombreClase",
      "attributes": [
        {"name": "atributo", "type": "String", "visibility": "private"},
        {"name": "otroAtributo", "type": "Integer", "visibility": "public"}
      ],
      "methods": []
    }
  ],
  "relationships": [
    {
      "type": "association",
      "source": "ClaseOrigen",
      "target": "ClaseDestino",
      "sourceMultiplicity": "1",
      "targetMultiplicity": "0..*"
    }
  ]
}

⚠️ FORMATO CRÍTICO PARA RELACIONES:
- "source": clase de ORIGEN (donde sale la flecha o está el rombo)
- "target": clase de DESTINO (donde llega la flecha o NO está el rombo)
- "sourceMultiplicity": multiplicidad en el extremo SOURCE (ej: "1", "*", "0..*", "1..*")
- "targetMultiplicity": multiplicidad en el extremo TARGET (ej: "1", "*", "0..*", "1..*")

EJEMPLOS REALES:
1. Producto 0..*────1 Categoría (asociación):
   {
     "type": "association",
     "source": "Producto",
     "target": "Categoría",
     "sourceMultiplicity": "0..*",
     "targetMultiplicity": "1"
   }

2. Venta 1────* DetalleVenta (asociación):
   {
     "type": "association",
     "source": "Venta",
     "target": "DetalleVenta",
     "sourceMultiplicity": "1",
     "targetMultiplicity": "*"
   }

3. Categoría ◊────* Producto (agregación, rombo en Categoría):
   {
     "type": "aggregation",
     "source": "Categoría",
     "target": "Producto",
     "sourceMultiplicity": "1",
     "targetMultiplicity": "*"
   }

Reglas universales:
- Visibilidad de atributos: Detectar desde el diagrama:
  * "-" = "private" (por defecto si no hay símbolo)
  * "+" = "public" 
  * "#" = "protected"
- Tipos: "String", "Integer", "Float", "Date", "Boolean" según corresponda
- NO incluir atributos "id" - se asumen implícitamente
- Para relaciones directas: crear una relación "association" con multiplicidad apropiada
- Para relaciones M:N: crear relaciones separadas desde cada entidad principal hacia la tabla intermedia
- ¡IMPORTANTE!: Una línea = una relación, evitar duplicados bidireccionales
- ⚠️ CRÍTICO: Verificar que cada "Detalle*" tenga 2 conexiones
- Analizar cuidadosamente las líneas y multiplicidades visibles en el diagrama`;

  const payload = {
    model: 'gpt-4o', // Modelo más económico
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.1,
  };

  console.log('🤖 Analizando imagen con IA Vision...');

  // CAMBIO: Usar edge function proxy en lugar de llamar directamente a OpenAI
  const response = await fetch(OPENAI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Error desconocido' }));
    // El proxy devuelve { error: "texto" }; OpenAI devuelve { error: { message } }
    const detalle =
      typeof errorData.error === 'string' ? errorData.error : errorData.error?.message;
    throw new Error(`Error IA: ${detalle || response.statusText || response.status}`);
  }

  const result = await response.json();

  // Extraer información de uso
  const usage = result.usage || {};
  const cost =
    ((usage.prompt_tokens || 0) * 0.00015 + (usage.completion_tokens || 0) * 0.0006) / 1000;

  console.log(`✅ Análisis completado`);
  console.log(`💰 Costo estimado: $${cost.toFixed(6)} USD`);
  console.log(`🔢 Tokens usados: ${usage.total_tokens || 0}`);

  // Parsear respuesta
  let content = result.choices[0]?.message?.content || '';

  // Limpiar markdown si existe (```json ... ```) y quedarse solo con el objeto JSON
  content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const inicioJson = content.indexOf('{');
  const finJson = content.lastIndexOf('}');
  if (inicioJson > 0 || (finJson !== -1 && finJson < content.length - 1)) {
    content = content.slice(inicioJson, finJson + 1);
  }

  try {
    const parsedData = JSON.parse(content);

    // 🔍 LOGGING DETALLADO PARA DEBUGGING
    console.log('📊 === RESPUESTA COMPLETA DE OPENAI ===');
    console.log('🏛️ Clases detectadas:');
    parsedData.classes?.forEach((cls: any, index: number) => {
      console.log(`  ${index + 1}. ${cls.name}`);
      console.log(
        `     Atributos: [${cls.attributes?.map((a: any) => `${a.name}:${a.type}(${a.visibility || 'sin-scope'})`).join(', ') || 'ninguno'}]`
      );
    });

    console.log('🔗 Relaciones detectadas:');
    parsedData.relationships?.forEach((rel: any, index: number) => {
      console.log(`  ${index + 1}. ${rel.source} → ${rel.target}`);
      console.log(`     Tipo: ${rel.type}, Multiplicidad: ${rel.multiplicity}`);
    });

    // ANÁLISIS DE TIPOS DE RELACIÓN
    console.log('🔍 ANÁLISIS DE TIPOS DE RELACIÓN:');
    const relationshipTypes = new Map<string, number>();
    parsedData.relationships?.forEach((rel: any) => {
      const type = rel.type || 'undefined';
      relationshipTypes.set(type, (relationshipTypes.get(type) || 0) + 1);
    });

    console.log('📊 Distribución de tipos de relación:');
    for (const [type, count] of relationshipTypes.entries()) {
      console.log(`  - ${type}: ${count} relaciones`);
    }

    if (relationshipTypes.size === 1 && relationshipTypes.has('association')) {
      console.log(`  ⚠️ ADVERTENCIA: Solo se detectaron relaciones de asociación.`);
      console.log(
        `     Si el diagrama tiene herencia/composición/agregación, revisar detección visual.`
      );
    }

    // Análisis general de relaciones
    console.log('🔍 ANÁLISIS GENERAL DE RELACIONES:');
    console.log(`  Total relaciones detectadas: ${parsedData.relationships?.length || 0}`);
    console.log(`  Total clases detectadas: ${parsedData.classes?.length || 0}`);

    // Verificar patrones M:N universales
    const tablesWithDetalle =
      parsedData.classes?.filter(
        (cls: any) =>
          cls.name.toLowerCase().includes('detalle') ||
          cls.name.toLowerCase().includes('intermedia') ||
          cls.name.toLowerCase().includes('inscripcion')
      ) || [];
    console.log(
      `  Posibles tablas intermedias: ${tablesWithDetalle.map((t: any) => t.name).join(', ') || 'ninguna'}`
    );

    // Verificar conectividad general
    const allClassNames = parsedData.classes?.map((cls: any) => cls.name) || [];
    const connectedClasses = new Set<string>();
    parsedData.relationships?.forEach((rel: any) => {
      connectedClasses.add(rel.source);
      connectedClasses.add(rel.target);
    });
    const unconnectedClasses = allClassNames.filter((name: string) => !connectedClasses.has(name));
    if (unconnectedClasses.length > 0) {
      console.log(`  ⚠️ Clases sin conexiones: ${unconnectedClasses.join(', ')}`);
    }

    // VERIFICACIÓN ESPECÍFICA: Comprobar relaciones esperadas comunes
    const expectedCommonRelations = [
      { actor: 'Cliente', action: 'Venta' },
      { actor: 'Proveedor', action: 'Compra' },
      { classifier: 'Categoria', classified: 'Producto' },
    ];

    expectedCommonRelations.forEach(expected => {
      const hasRelation = parsedData.relationships?.some(
        (rel: any) =>
          (rel.source === expected.actor && rel.target === expected.action) ||
          (rel.source === expected.classifier && rel.target === expected.classified) ||
          (rel.source === expected.action && rel.target === expected.actor) ||
          (rel.source === expected.classified && rel.target === expected.classifier)
      );

      const hasActor = allClassNames.includes(expected.actor || expected.classifier || '');
      const hasAction = allClassNames.includes(expected.action || expected.classified || '');

      if (hasActor && hasAction && !hasRelation) {
        console.log(
          `  🚨 RELACIÓN FALTANTE DETECTADA: ${expected.actor || expected.classifier} ↔ ${expected.action || expected.classified}`
        );
      }
    });

    console.log('📄 JSON completo:', JSON.stringify(parsedData, null, 2));
    console.log('============================================');

    return parsedData;
  } catch (error) {
    console.error('❌ Error parseando JSON:', error);
    console.error('📄 Respuesta recibida:', content);
    throw new Error('La respuesta de OpenAI no es un JSON válido');
  }
}

/**
 * Función principal: importa una imagen, la analiza y retorna nodos/edges
 */
export async function importDiagramFromImage(
  file: File,
  onProgress?: (stage: string) => void
): Promise<AnalysisResult> {
  try {
    // Fase 1: Subir imagen
    onProgress?.('Subiendo imagen a Supabase...');
    const imageUrl = await uploadImageToSupabase(file);

    // Fase 2: Analizar con OpenAI
    onProgress?.('Analizando diagrama con IA...');
    const openaiResponse = await analyzeImageWithOpenAI(imageUrl);

    // Fase 3: Convertir a formato UML
    onProgress?.('Convirtiendo a formato UML...');
    const { nodes, edges } = convertOpenAIToUMLConstants(openaiResponse);

    console.log(`📊 Importación exitosa: ${nodes.length} clases, ${edges.length} relaciones`);

    return {
      success: true,
      nodes,
      edges,
    };
  } catch (error) {
    console.error('❌ Error en importación:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Valida que se tenga un token de OpenAI configurado (legacy, ya no se usa)
 */
export function validateOpenAIToken(token: string): boolean {
  return !!(token && token.startsWith('sk-') && token.length > 20);
}
