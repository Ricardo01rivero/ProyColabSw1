/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeType, EdgeType } from '../utils/umlConstants';

// Configuración del proxy de OpenAI
const PROXY_URL = 'https://izsllyjacdhfeoexwpvh.supabase.co/functions/v1/openai-proxy';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2xseWphY2RoZmVvZXh3cHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwODk2NjQsImV4cCI6MjA3NjY2NTY2NH0.VYW4TKIdKLj2JcL3lxOCTBT6QwOhMrG_P6WWFSAnRDM'; 

export interface DiagramAction {
  type: 'create' | 'update' | 'delete';
  target: 'class' | 'attribute' | 'edge';
  data: any;
}

/**
 * Procesa un prompt en lenguaje natural usando OpenAI para generar acciones sobre el diagrama UML
 */
export const processUMLPrompt = async (
  prompt: string,
  currentNodes: NodeType[],
  currentEdges: EdgeType[]
): Promise<DiagramAction[]> => {
  // Preparar el contexto de manera segura
  const contextClasses = currentNodes.map(n => ({
    id: n.id,
    nombre: n.label,
    atributos: n.attributes?.map(a => `${a.name}: ${a.datatype} (${a.scope})`) || [],
  }));

  const contextRelations = currentEdges.map(e => ({
    id: e.id,
    desde: currentNodes.find(n => n.id === e.source)?.label || 'desconocido',
    hacia: currentNodes.find(n => n.id === e.target)?.label || 'desconocido',
    tipo: e.tipo,
    multiplicidad: `${e.multiplicidadOrigen}:${e.multiplicidadDestino}`,
  }));

  const systemPrompt = `Eres un asistente experto en diagramas UML de clases. Tu tarea es interpretar instrucciones en lenguaje natural y convertirlas en acciones específicas sobre un diagrama de clases.

CONTEXTO ACTUAL DEL DIAGRAMA:
Clases existentes: ${JSON.stringify(contextClasses, null, 2)}

Relaciones existentes: ${JSON.stringify(contextRelations, null, 2)}

TIPOS DE ACCIONES DISPONIBLES:
1. Crear clase: 
   { type: 'create', target: 'class', data: { label: string, attributes: [{name: string, datatype: 'String'|'Integer'|'Float'|'Boolean'|'Date', scope: 'public'|'private'|'protected'}], asociativa?: boolean, relaciona?: [string, string] } }

2. Actualizar clase existente: 
   { type: 'update', target: 'class', data: { id: string, label?: string, attributes?: [...] } }

3. Eliminar clase: 
   { type: 'delete', target: 'class', data: { id: string, label: string } }

4. Agregar atributo a clase existente: 
   { type: 'create', target: 'attribute', data: { classId: string, name: string, datatype: string, scope: string } }

5. Eliminar atributo de una clase:
   { type: 'delete', target: 'attribute', data: { classId: string, className: string, attributeName: string } }

6. Crear relación entre clases: 
   { type: 'create', target: 'edge', data: { sourceLabel: string, targetLabel: string, tipo: 'asociacion'|'herencia'|'composicion'|'agregacion'|'dependencia', multiplicidadOrigen: '1'|'*', multiplicidadDestino: '1'|'*' } }

7. Eliminar relación: 
   { type: 'delete', target: 'edge', data: { id?: string, sourceLabel?: string, targetLabel?: string } }

REGLAS DE INTERPRETACIÓN:
- "clase", "entidad", "tabla" → crear/modificar clase
- "elimina", "borra", "quita", "remueve" + "clase" → eliminar clase
- "atributo", "propiedad", "campo", "variable" → crear/modificar atributo
- "elimina", "borra", "quita" + "atributo" → eliminar atributo
- "elimina", "borra", "quita" + "relación" → eliminar relación
- "hereda", "extiende", "es un" → relación de herencia (tipo: 'herencia', multiplicidad: 1:1)
- "usa", "utiliza", "depende de" → relación de dependencia (tipo: 'dependencia', multiplicidad: 1:1)
- "se asocia con", "está relacionado" → relación de asociación (tipo: 'asociacion')
- "muchos a muchos", "m:n", "* a *", "*:*" → SIEMPRE crear clase intermedia asociativa + dos relaciones (1:*) desde cada clase hacia la intermedia

RECONOCIMIENTO DE CARDINALIDADES EN ASOCIACIONES/COMPOSICIONES/AGREGACIONES:
- "tiene uno", "posee uno", "1 a 1", "1:1" → multiplicidad: 1:1
- "tiene muchos", "posee muchos", "1 a muchos", "1:*", "1 a varios" → multiplicidad: 1:* (origen=1, destino=*)
- "muchos a uno", "varios a uno", "*:1", "* a 1" → multiplicidad: *:1 (origen=*, destino=1)
- "muchos a muchos", "varios a varios", "*:*", "* a *", "m:n" → crear tabla intermedia
- "contiene", "compuesto por" → composición con multiplicidad 1:*
- "agrega", "agregación de" → agregación con multiplicidad 1:*

IMPORTANTE SOBRE MULTIPLICIDADES:
- multiplicidadOrigen: cardinalidad desde la clase origen (source)
- multiplicidadDestino: cardinalidad hacia la clase destino (target)
- Ejemplo: "Usuario tiene muchos Pedidos" = Usuario(1) → Pedidos(*) = multiplicidadOrigen:'1', multiplicidadDestino:'*'
- Ejemplo: "Muchos Productos pertenecen a una Categoría" = Productos(*) → Categoría(1) = multiplicidadOrigen:'*', multiplicidadDestino:'1'

TIPOS DE DATOS VÁLIDOS:
- String: textos, cadenas, varchar, char
- Integer: números enteros, int, long
- Float: números decimales, double, decimal
- Boolean: booleanos, bool, verdadero/falso
- Date: fechas, datetime, timestamp

SCOPES VÁLIDOS:
- private: privado, - (símbolo menos)
- public: público, + (símbolo más)
- protected: protegido, # (símbolo numeral)

MULTIPLICIDADES VÁLIDAS:
- '1': uno, individual, único
- '*': muchos, varios, múltiples, n

IMPORTANTE: 
- Responde ÚNICAMENTE con un array JSON válido de acciones
- NO incluyas explicaciones, texto adicional, ni markdown
- Para referenciar clases existentes, usa el ID del contexto
- Para crear nuevas clases, solo proporciona label y attributes
- Las multiplicidades deben ser exactamente '1' o '*'

EJEMPLOS DE INTERPRETACIÓN:

Usuario: "Crea una clase Usuario con nombre tipo String y email tipo String"
Respuesta: [{"type":"create","target":"class","data":{"label":"Usuario","attributes":[{"name":"nombre","datatype":"String","scope":"private"},{"name":"email","datatype":"String","scope":"private"}]}}]

Usuario: "Agrega edad tipo Integer a la clase Usuario"
Respuesta: [{"type":"create","target":"attribute","data":{"classId":"node_usuario_id","name":"edad","datatype":"Integer","scope":"private"}}]

Usuario: "Usuario hereda de Persona"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Usuario","targetLabel":"Persona","tipo":"herencia","multiplicidadOrigen":"1","multiplicidadDestino":"1"}}]

Usuario: "Producto tiene una relación de composición con Categoría"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Categoria","targetLabel":"Producto","tipo":"composicion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]

Usuario: "Usuario tiene muchos Pedidos"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Usuario","targetLabel":"Pedido","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]

Usuario: "Muchos Productos pertenecen a una Categoría"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Producto","targetLabel":"Categoria","tipo":"asociacion","multiplicidadOrigen":"*","multiplicidadDestino":"1"}}]

Usuario: "Persona tiene una Dirección"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Persona","targetLabel":"Direccion","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"1"}}]

Usuario: "Crea una asociación 1 a muchos entre Cliente y Pedido"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Cliente","targetLabel":"Pedido","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]

Usuario: "Asociación de muchos a uno entre Empleado y Departamento"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Empleado","targetLabel":"Departamento","tipo":"asociacion","multiplicidadOrigen":"*","multiplicidadDestino":"1"}}]

Usuario: "Relación 1:1 entre Usuario y Perfil"
Respuesta: [{"type":"create","target":"edge","data":{"sourceLabel":"Usuario","targetLabel":"Perfil","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"1"}}]

Usuario: "Crea Pedido con fecha tipo Date y total tipo Float, luego Pedido tiene muchos DetallePedido"
Respuesta: [{"type":"create","target":"class","data":{"label":"Pedido","attributes":[{"name":"fecha","datatype":"Date","scope":"private"},{"name":"total","datatype":"Float","scope":"private"}]}},{"type":"create","target":"class","data":{"label":"DetallePedido","attributes":[]}},{"type":"create","target":"edge","data":{"sourceLabel":"Pedido","targetLabel":"DetallePedido","tipo":"composicion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]

Usuario: "Elimina la clase Usuario"
Respuesta: [{"type":"delete","target":"class","data":{"id":"node_usuario_id","label":"Usuario"}}]

Usuario: "Borra el atributo email de Usuario"
Respuesta: [{"type":"delete","target":"attribute","data":{"classId":"node_usuario_id","className":"Usuario","attributeName":"email"}}]

Usuario: "Elimina la relación entre Pedido y DetallePedido"
Respuesta: [{"type":"delete","target":"edge","data":{"sourceLabel":"Pedido","targetLabel":"DetallePedido"}}]

Usuario: "Cambia el nombre de Cliente a Comprador"
Respuesta: [{"type":"update","target":"class","data":{"id":"node_cliente_id","label":"Comprador"}}]

Usuario: "Relación muchos a muchos entre Estudiante y Curso"
Respuesta: [{"type":"create","target":"class","data":{"label":"Estudiante_Curso","attributes":[],"asociativa":true,"relaciona":["Estudiante","Curso"]}},{"type":"create","target":"edge","data":{"sourceLabel":"Estudiante","targetLabel":"Estudiante_Curso","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}},{"type":"create","target":"edge","data":{"sourceLabel":"Curso","targetLabel":"Estudiante_Curso","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]

Usuario: "Crear relación * a * entre extremo y NEGRA"
Respuesta: [{"type":"create","target":"class","data":{"label":"extremo_NEGRA","attributes":[],"asociativa":true,"relaciona":["extremo","NEGRA"]}},{"type":"create","target":"edge","data":{"sourceLabel":"extremo","targetLabel":"extremo_NEGRA","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}},{"type":"create","target":"edge","data":{"sourceLabel":"NEGRA","targetLabel":"extremo_NEGRA","tipo":"asociacion","multiplicidadOrigen":"1","multiplicidadDestino":"*"}}]`;

  // Headers
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const payload = {
    model: 'gpt-4o', //gpt-4-turbo-preview -> mas caro xd
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  };

  console.log('🤖 Procesando prompt con OpenAI...');
  console.log('📝 Prompt del usuario:', prompt);

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: { message: 'Error desconocido' } }));
      throw new Error(`Error OpenAI: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();

    const usage = result.usage || {};
    const cost =
      ((usage.prompt_tokens || 0) * 0.00015 + (usage.completion_tokens || 0) * 0.0006) / 1000;

    console.log(`✅ Análisis completado`);
    console.log(`💰 Costo estimado: $${cost.toFixed(6)} USD`);
    console.log(`🔢 Tokens usados: ${usage.total_tokens || 0}`);

    const content = result.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No se recibió respuesta de la IA');
    }

    console.log('📄 Respuesta de OpenAI:', content);

    let jsonText = content.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').trim();
    }

    let actions: DiagramAction[];
    try {
      actions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('❌ Error parseando JSON:', parseError);
      console.error('📄 Contenido recibido:', jsonText);
      throw new Error('La respuesta de la IA no es un JSON válido');
    }

    if (!Array.isArray(actions)) {
      throw new Error('La respuesta debe ser un array de acciones');
    }

    console.log('🎯 Acciones generadas:', JSON.stringify(actions, null, 2));
    console.log(`📊 Total de acciones: ${actions.length}`);

    return actions;
  } catch (error) {
    console.error('❌ Error procesando prompt:', error);
    if (error instanceof Error) {
      throw new Error(
        `No se pudo procesar tu solicitud: ${error.message}. Por favor intenta con una instrucción más clara.`
      );
    }
    throw new Error('Error desconocido al procesar la solicitud');
  }
};

export function validateOpenAIToken(): boolean {
  // Token validation is now handled by the Supabase proxy
  return true;
}