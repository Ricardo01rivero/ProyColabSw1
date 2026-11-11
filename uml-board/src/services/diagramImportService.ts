/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeType, EdgeType } from '../utils/umlConstants';

// Supabase y proxy de OpenAI (centralizados en supabase.config)
import { supabase } from '../lib/supabase.config';
import { aiFetch } from '../lib/aiClient';

// Tipos para el análisis OpenAI
type OpenAIClass = {
  name: string;
  /** Clase de asociación: las dos clases cuya línea la sostiene */
  associationOf?: string[];
  attributes: Array<{
    name: string;
    type: string;
    visibility: 'public' | 'private' | 'protected';
    /** Agregado por la IA (no estaba en el dibujo) */
    inferred?: boolean;
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
  inferred?: boolean; // tipo o multiplicidad deducidos por la IA
};

type OpenAIResponse = {
  domain?: string;
  classes: OpenAIClass[];
  relationships: OpenAIRelationship[];
  notes?: string[];
};

type AnalysisResult = {
  success: boolean;
  nodes?: NodeType[];
  edges?: EdgeType[];
  error?: string;
  cost?: number;
  /** Resumen legible: de qué trata el diagrama y qué completó la IA */
  summary?: string;
};

/** Arma el resumen para el usuario separando lo leído del dibujo de lo deducido por la IA. */
function buildImportSummary(data: OpenAIResponse): string {
  const lines: string[] = [];
  if (data.domain) lines.push(`📌 Tema detectado: ${data.domain}`);

  const inferredAttrs = (data.classes || [])
    .map(c => ({
      name: c.name,
      attrs: (c.attributes || []).filter(a => a?.inferred).map(a => a.name),
    }))
    .filter(c => c.attrs.length > 0);
  if (inferredAttrs.length) {
    lines.push('', '💡 Atributos SUGERIDOS por la IA (no estaban en el dibujo):');
    inferredAttrs.forEach(c => lines.push(`   • ${c.name}: ${c.attrs.join(', ')}`));
  }

  const inferredRels = (data.relationships || []).filter(r => r?.inferred);
  if (inferredRels.length) {
    lines.push('', '🔗 Relaciones DEDUCIDAS (tipo o multiplicidad no legible):');
    inferredRels.forEach(r => lines.push(`   • ${r.source} → ${r.target} (${r.type})`));
  }

  const notes = (data.notes || []).filter(Boolean).slice(0, 5);
  if (notes.length) {
    lines.push('', '📝 Notas de la IA:');
    notes.forEach(n => lines.push(`   • ${n}`));
  }

  if (inferredAttrs.length || inferredRels.length) {
    lines.push('', 'Revísalos en la pizarra o pregúntale a la IA Dev Senior en el chat si son correctos.');
  }
  return lines.join('\n');
}

/**
 * Convierte la respuesta de OpenAI al formato esperado por umlConstants
 */
export function convertOpenAIToUMLConstants(openaiData: OpenAIResponse): {
  nodes: NodeType[];
  edges: EdgeType[];
} {
  const nodes: NodeType[] = [];
  const edges: EdgeType[] = [];

  // Saneamiento: nombres sin espacios sobrantes y sin clases repetidas
  const seenNames = new Set<string>();
  openaiData.classes = (openaiData.classes || [])
    .map(c => ({ ...c, name: (c.name || '').trim(), attributes: c.attributes || [] }))
    .filter(c => c.name && !seenNames.has(c.name) && seenNames.add(c.name));
  const classNames = new Set(openaiData.classes.map(c => c.name));
  openaiData.relationships = (openaiData.relationships || []).filter(
    r => classNames.has(r.source) && classNames.has(r.target) && r.source !== r.target
  );

  // CLASES DE ASOCIACIÓN indicadas por la IA (rectángulo colgado de la línea A—B):
  // se modelan como tabla intermedia A -> C <- B, sin relación directa A—B.
  const associationByAI = new Set<string>();
  openaiData.classes.forEach(cls => {
    const pair = cls.associationOf;
    if (!Array.isArray(pair) || pair.length !== 2) return;
    const [a, b] = pair;
    if (a === b || !classNames.has(a) || !classNames.has(b) || a === cls.name || b === cls.name) return;
    associationByAI.add(cls.name);
    openaiData.relationships = openaiData.relationships.filter(
      r =>
        !((r.source === a && r.target === b) || (r.source === b && r.target === a)) &&
        !([a, b].includes(r.source) && r.target === cls.name) &&
        !([a, b].includes(r.target) && r.source === cls.name)
    );
    openaiData.relationships.push(
      { type: 'association', source: a, target: cls.name, sourceMultiplicity: '1', targetMultiplicity: '*' },
      { type: 'association', source: b, target: cls.name, sourceMultiplicity: '1', targetMultiplicity: '*' }
    );
  });

  console.log('🧱 Creando nodos...');

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
      // Filtrar el identificador (id, id_socio, idCuota...) ya que el sistema lo agrega
      attributes: cls.attributes
        .filter(attr => attr?.name && !/^id([\s_-]|[A-Z]|$)/.test(attr.name.trim()) && attr.name.trim().toLowerCase() !== 'id')
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
    if (!isDetalleEntity && !isIntermediaEntity && !associationByAI.has(candidateName)) {
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

  const m = mult.toLowerCase().replace(/\s+/g, '');
  if (m.includes('many') || m.includes('muchos')) return '*';

  // Se decide por el límite superior: "0..*", "1..*", "*", "n", "2..5" -> muchos; "1", "0..1", "1..1" -> uno.
  // En notaciones invertidas a mano como "*..1" se toma el valor más grande.
  const bounds = m.split('..').filter(Boolean);
  const isMany = (b: string) => b === '*' || b === 'n' || b === 'm' || (/^\d+$/.test(b) && Number(b) > 1);
  return bounds.some(isMany) ? '*' : '1';
}

/**
 * Corrige la direccionalidad de relaciones basándose en patrones semánticos universales
 */
function correctRelationshipDirection(rel: OpenAIRelationship): OpenAIRelationship {
  // Herencia, composición y agregación ya traen su dirección del dibujo (triángulo / rombo): no tocarlas.
  if (rel.type && rel.type.toLowerCase() !== 'association') return rel;

  const source = rel.source.toLowerCase();
  const target = rel.target.toLowerCase();
  // Invertir la dirección también intercambia las multiplicidades (si no, se corrompe la cardinalidad)
  const invert = (r: OpenAIRelationship): OpenAIRelationship => ({
    ...r,
    source: r.target,
    target: r.source,
    sourceMultiplicity: r.targetMultiplicity,
    targetMultiplicity: r.sourceMultiplicity,
  });

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
      return invert(rel);
    }
  }

  // Sin heurísticas por nombre (singular/plural, etc.): en español fallaban ("Envios", "Socios")
  // y la dirección de una asociación no cambia su significado si se respetan las multiplicidades.
  console.log(`   ➡️ Sin corrección aplicable: manteniendo ${rel.source} → ${rel.target}`);
  return rel;
}

/**
 * Sube una imagen a Supabase y retorna la URL pública
 */
/**
 * Reduce fotos grandes (celular: 4000px y 5-12 MB) a máx. 2000px en JPEG.
 * La IA lee igual de bien y la subida/análisis es mucho más rápido. createImageBitmap
 * respeta la orientación EXIF, así que una foto vertical no queda acostada.
 */
async function prepareImage(file: File): Promise<File> {
  const MAX_SIDE = 2000;
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.88));
    if (!blob) return file;
    console.log(
      `🗜️ Imagen reducida: ${(file.size / 1024 / 1024).toFixed(2)} MB -> ${(blob.size / 1024 / 1024).toFixed(2)} MB`
    );
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // si el navegador no puede procesarla, se envía tal cual
  }
}

async function uploadImageToSupabase(original: File): Promise<string> {
  // Validar archivo
  if (!original.type.startsWith('image/')) {
    throw new Error('Solo se permiten archivos de imagen');
  }
  const file = await prepareImage(original);

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
  const prompt = `Eres un experto en UML 2.5. La imagen es un DIAGRAMA DE CLASES que puede estar dibujado A MANO
(cuaderno, hoja o pizarra con marcadores), fotografiado torcido, girado 90°/180°, con sombras, reflejos o letra difícil.
Tu tarea es transcribirlo FIELMENTE a JSON. RESPONDE SOLO CON EL JSON, sin texto adicional ni bloques de código.

PASO 1 - ORIENTACIÓN Y LECTURA
- Si la imagen está girada, léela mentalmente en la orientación correcta.
- Cada CLASE es un rectángulo con el NOMBRE en el primer compartimento y los ATRIBUTOS en el segundo.
- Lee la letra a mano con cuidado; corrige solo errores ortográficos evidentes (ej: "Matenimiento" -> "Mantenimiento").
- NO inventes clases, atributos ni relaciones que no estén dibujados. NO omitas ninguno que sí esté.

PASO 2 - NOMBRES
- Clases: PascalCase, en singular si el autor no insiste en plural, sin espacios ni tildes ni guiones bajos
  ("Personal Sanitario" -> "PersonalSanitario", "Tipo_Cuota" -> "TipoCuota", "Envíos" -> "Envio").
- Atributos: camelCase sin tildes ("fecha salida" -> "fechaSalida", "importe_anual" -> "importeAnual").
- OMITE el atributo identificador de cada clase: "id", "ID", "id_xxx", "idXxx", "cod" o "codigo" cuando es claramente
  la clave (el sistema agrega "id" automáticamente). Conserva los demás atributos aunque parezcan códigos de negocio.
- Tipos (infiere por el nombre si no está escrito): fecha/hora -> "Date"; precio, costo, total, monto, importe,
  sueldo, area, peso, presupuesto -> "Float"; cantidad, nro, numero, edad, stock, capacidad, consumo -> "Integer";
  activo/estado booleano -> "Boolean"; lo demás -> "String". Visibilidad: "+" public, "#" protected, si no "private".

PASO 3 - RELACIONES (revisa CADA línea que toque un rectángulo)
- Línea simple -> "association".
- Triángulo vacío en un extremo -> "inheritance": source = clase HIJA (sin triángulo), target = clase PADRE
  (donde está el triángulo). Varias hijas pueden compartir el mismo triángulo: crea una relación por cada hija.
- Rombo relleno -> "composition"; rombo vacío -> "aggregation": source = clase con el rombo (el todo), target = la parte.
- Multiplicidades: copia lo escrito junto a cada extremo ("1", "*", "0..*", "1..*", "0..1", "1..1", "*..1").
  sourceMultiplicity es lo escrito junto a la clase source y targetMultiplicity lo escrito junto a la target.
  Si no hay nada escrito usa "1".
- Ignora los nombres/verbos de las relaciones ("realiza", "pertenece", "tiene"), flechas de navegación, palomitas,
  restricciones como {disjunta, completa} y notas.

PASO 4 - CLASES DE ASOCIACIÓN (muy común en estos diagramas)
- Una clase de asociación es un rectángulo unido con una línea (a veces punteada) al MEDIO de la línea que une
  otras dos clases A y B. Inclúyela en "classes" con "associationOf": ["A", "B"] y NO generes relaciones para ella
  (el sistema crea las claves foráneas a A y B).
- Si ese rectángulo NO tiene nombre, nómbralo uniendo los nombres de A y B (ej: "AutobusParada") y conserva sus
  atributos si los tiene.
- Un rectángulo vacío y sin nombre que NO está unido a ninguna línea es un borrador: ignóralo.

PASO 5 - ENTENDER EL DOMINIO Y COMPLETAR (como lo haría un analista)
- Deduce de qué trata el sistema (ej: "ONG de envíos humanitarios con sedes, socios y voluntarios") y ponlo en "domain".
- Si una clase quedó SIN atributos (vacía en el dibujo o ilegible), agrégale de 2 a 4 atributos OBVIOS para ese
  dominio (ej: Medicamento -> nombre, dosis, fechaVencimiento) y marca cada uno con "inferred": true.
  Si la clase tiene atributos legibles, NO le agregues más. Las subclases de una herencia pueden quedar con 1-2
  atributos propios que las distingan de la clase padre.
- Si una línea existe pero su tipo o sus multiplicidades no se leen, dedúcelos por el sentido del dominio
  (ej: varias clases "tipo de" conectadas a una clase general -> "inheritance"; Cliente-Factura -> 1 a *)
  y marca la relación con "inferred": true. Lo que SÍ se lee del dibujo nunca se cambia.
- NO agregues clases ni relaciones que no estén dibujadas.
- En "notes" explica en frases cortas (en español) lo que dedujiste y por qué.

FORMATO EXACTO:
{
  "domain": "<de qué trata el sistema dibujado>",
  "classes": [
    { "name": "<ClaseA>", "attributes": [ {"name": "<atributoLeido>", "type": "String", "visibility": "private"} ], "methods": [] },
    { "name": "<ClaseB>", "attributes": [ {"name": "<atributoSugerido>", "type": "String", "visibility": "private", "inferred": true} ], "methods": [] },
    { "name": "<ClaseAClaseC>", "associationOf": ["<ClaseA>", "<ClaseC>"], "attributes": [], "methods": [] }
  ],
  "relationships": [
    { "type": "association", "source": "<ClaseC>", "target": "<ClaseD>", "sourceMultiplicity": "1", "targetMultiplicity": "*" },
    { "type": "inheritance", "source": "<ClaseB>", "target": "<ClaseA>", "sourceMultiplicity": "1", "targetMultiplicity": "1", "inferred": true }
  ],
  "notes": ["<una frase por cada deducción, con el motivo>"]
}

VERIFICACIÓN FINAL antes de responder:
- ¿Cada rectángulo con nombre del dibujo aparece en "classes"?
- ¿Cada línea entre dos rectángulos aparece UNA sola vez en "relationships" (sin duplicar A->B y B->A)?
- ¿Los nombres usados en "relationships" y "associationOf" coinciden EXACTAMENTE con los de "classes"?`;

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
    max_tokens: 4000,
    temperature: 0.1,
    // La IA local (Ollama) lo usa para garantizar JSON válido; el proxy de Gemini lo ignora
    response_format: { type: 'json_object' },
  };

  console.log('🤖 Analizando imagen con IA Vision...');

  // CAMBIO: Usar edge function proxy en lugar de llamar directamente a OpenAI
  // Nube (Gemini vía proxy) o IA local (Ollama en Colab) según el selector del chat
  const response = await aiFetch(payload);

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
      summary: buildImportSummary(openaiResponse),
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
