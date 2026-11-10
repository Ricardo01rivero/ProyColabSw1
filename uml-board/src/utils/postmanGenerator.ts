// postmanGenerator.ts
// Genera una colección Postman con endpoints CRUD para cada entidad
// Uso: importar y llamar a generatePostmanCollection(classes)

import type { NodeType, EdgeType } from './umlConstants';
import { foreignKeysFor } from './fkRules';

type ClassNode = NodeType;

// Devuelve un valor de ejemplo según el tipo de dato
function exampleValue(type: string): string | number | boolean {
  switch (type) {
    case 'Integer':
      return 1;
    case 'Float':
      return 1.5;
    case 'Boolean':
      return true;
    case 'Date':
      return '2023-01-01';
    case 'String':
      return 'texto';
    default:
      return 'valor';
  }
}

// Nombres de los campos foráneos (misma regla que el backend: ver fkRules.ts)
function getForeignKeyFieldNames(cls: ClassNode, nodes: NodeType[], edges: EdgeType[]): string[] {
  return foreignKeysFor(cls, nodes, edges).map(fk => fk.fieldName);
}

export function generatePostmanCollection(
  classes: ClassNode[],
  nodes: NodeType[],
  edges: EdgeType[]
): string {
  const collection = {
    info: {
      name: 'DemoAPI',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: 'demo-api-collection',
    },
    item: [] as Record<string, unknown>[],
  };
  classes.forEach(cls => {
    const baseUrl = `http://localhost:8080/${cls.label.toLowerCase()}s`;
    const attrs = (cls.attributes ?? []).filter(a => a.name !== 'id');
    // Atributos foráneos generados por relaciones
    const foreignKeyNames = getForeignKeyFieldNames(cls, nodes, edges);
    // Generar cuerpo de ejemplo
    const allFields = [
      ...attrs.map(a => ({ name: a.name, type: a.datatype })),
      ...foreignKeyNames
        .filter(fk => !attrs.some(a => a.name === fk))
        .map(fk => ({ name: fk, type: 'Integer' })),
    ];
    const postBodyObj: Record<string, string | number | boolean> = {};
    allFields.forEach(f => {
      postBodyObj[f.name] = exampleValue(f.type);
    });
    const putBodyObj: Record<string, string | number | boolean> = {};
    allFields.forEach(f => {
      putBodyObj[f.name] = f.type === 'String' ? 'actualizado' : exampleValue(f.type);
    });
    const postBody = JSON.stringify(postBodyObj, null, 2);
    const putBody = JSON.stringify(putBodyObj, null, 2);
    collection.item.push({
      name: `Get All ${cls.label}s`,
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: baseUrl,
          protocol: 'http',
          host: ['localhost'],
          port: '8080',
          path: [cls.label.toLowerCase() + 's'],
        },
      },
      response: [],
    });
    collection.item.push({
      name: `Get ${cls.label} by ID`,
      request: {
        method: 'GET',
        header: [],
        url: {
          raw: baseUrl + '/1',
          protocol: 'http',
          host: ['localhost'],
          port: '8080',
          path: [cls.label.toLowerCase() + 's', '1'],
        },
      },
      response: [],
    });
    collection.item.push({
      name: `Create ${cls.label}`,
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: postBody },
        url: {
          raw: baseUrl,
          protocol: 'http',
          host: ['localhost'],
          port: '8080',
          path: [cls.label.toLowerCase() + 's'],
        },
      },
      response: [],
    });
    collection.item.push({
      name: `Update ${cls.label}`,
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: putBody },
        url: {
          raw: baseUrl + '/1',
          protocol: 'http',
          host: ['localhost'],
          port: '8080',
          path: [cls.label.toLowerCase() + 's', '1'],
        },
      },
      response: [],
    });
    collection.item.push({
      name: `Delete ${cls.label}`,
      request: {
        method: 'DELETE',
        header: [],
        url: {
          raw: baseUrl + '/1',
          protocol: 'http',
          host: ['localhost'],
          port: '8080',
          path: [cls.label.toLowerCase() + 's', '1'],
        },
      },
      response: [],
    });
  });
  return JSON.stringify(collection, null, 2);
}
