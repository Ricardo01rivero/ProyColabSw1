import type { NodeType, EdgeType } from './umlConstants';
import { buildErModel } from './erModel';

export interface ForeignKeyField {
  fieldName: string; // p. ej. "clienteId"
  className: string; // clase a la que apunta, p. ej. "Cliente"
}

/**
 * Única fuente de verdad de las claves foráneas para los generadores (Spring Boot, Flutter, Postman).
 * Usa el mismo modelo ER que la vista ER y el SQL exportado, así la clave foránea siempre va
 * donde corresponde según la multiplicidad:
 *   - 1:*  -> en la clase del lado "muchos"
 *   - *:1  -> en la clase origen (lado "muchos")
 *   - 1:1  -> en la clase destino
 *   - herencia -> en la clase hija
 *   - clase asociativa -> una FK por cada clase que relaciona
 */
export const foreignKeysFor = (
  cls: NodeType,
  nodes: NodeType[],
  edges: EdgeType[]
): ForeignKeyField[] => {
  const model = buildErModel(nodes, edges);
  const result: ForeignKeyField[] = [];
  const seen = new Set<string>();

  model.relations
    .filter(r => r.fromTable === cls.id)
    .forEach(r => {
      const parent = nodes.find(n => n.id === r.toTable);
      if (!parent) return;
      const fieldName = parent.label.charAt(0).toLowerCase() + parent.label.slice(1) + 'Id';
      if (seen.has(fieldName)) return;
      seen.add(fieldName);
      result.push({ fieldName, className: parent.label });
    });

  return result;
};
