import type { NodeType, EdgeType } from './umlConstants';

/**
 * Modelo entidad-relación derivado del diagrama de clases.
 * No se guarda nada aparte: se calcula siempre a partir de los nodos y relaciones,
 * así la vista ER y el SQL exportado nunca quedan desincronizados del diagrama.
 *
 * Reglas:
 *  - Cada clase es una tabla con PK `id`.
 *  - Cada atributo es una columna (nombres en minúsculas con guion bajo, como los crea Spring/Hibernate).
 *  - 1:*  -> FK `<tabla>_id` en el lado "muchos".
 *  - 1:1  -> FK `<tabla>_id` única en el destino.
 *  - *:*  -> tabla intermedia con PK compuesta (las clases asociativas ya son esa tabla).
 *  - Herencia -> FK única en la clase hija hacia la clase padre.
 *  - Dependencia -> no genera columnas (es una relación de uso, no de datos).
 */

export interface ErColumn {
  name: string;
  sqlType: string;
  pk: boolean;
  fk?: { table: string; column: string };
  unique?: boolean;
}

export interface ErTable {
  id: string; // id de la clase en el diagrama (o id sintético para tablas intermedias)
  name: string;
  columns: ErColumn[];
  compositePk?: string[]; // solo para tablas intermedias *:*
  synthetic?: boolean; // true si la tabla no existe como clase (generada por un *:*)
  junction?: boolean; // true si es una tabla intermedia (clase asociativa o *:* directo)
}

export interface ErRelation {
  id: string;
  fromTable: string; // id de la tabla que tiene la FK (lado "muchos" o hijo)
  toTable: string; // id de la tabla referenciada (lado "uno" o padre)
  column: string; // columna FK
  oneToOne: boolean;
  kind: EdgeType['tipo'] | 'asociativa';
}

export interface ErModel {
  tables: ErTable[];
  relations: ErRelation[];
}

const SQL_TYPES: Record<string, string> = {
  String: 'VARCHAR(255)',
  Integer: 'INTEGER',
  Float: 'DOUBLE PRECISION',
  Boolean: 'BOOLEAN',
  Date: 'DATE',
};

export const sqlTypeOf = (datatype: string): string => SQL_TYPES[datatype] ?? 'VARCHAR(255)';

/** "Fecha Nac" / "fechaNac" -> "fecha_nac" */
export const toSnake = (text: string): string => {
  const cleaned = text
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!cleaned) return 'col';
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
};

const uniqueName = (base: string, used: Set<string>): string => {
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}_${i++}`;
  used.add(name);
  return name;
};

export const buildErModel = (nodes: NodeType[], edges: EdgeType[]): ErModel => {
  const tableName = new Map<string, string>(); // id de clase -> nombre de tabla
  const usedTableNames = new Set<string>();
  nodes.forEach(n => tableName.set(n.id, uniqueName(toSnake(n.label), usedTableNames)));

  const tables = new Map<string, ErTable>();
  const usedColumns = new Map<string, Set<string>>();
  const relations: ErRelation[] = [];

  nodes.forEach(n => {
    const used = new Set<string>();
    const columns: ErColumn[] = [];
    const hasOwnId = (n.attributes ?? []).some(a => a.name.trim().toLowerCase() === 'id');

    if (!hasOwnId) {
      columns.push({ name: 'id', sqlType: 'BIGSERIAL', pk: true });
    }
    used.add('id');

    (n.attributes ?? []).forEach(a => {
      const isId = a.name.trim().toLowerCase() === 'id';
      if (isId) {
        columns.unshift({ name: 'id', sqlType: 'BIGSERIAL', pk: true });
        return;
      }
      columns.push({
        name: uniqueName(toSnake(a.name), used),
        sqlType: sqlTypeOf(a.datatype),
        pk: false,
      });
    });

    tables.set(n.id, { id: n.id, name: tableName.get(n.id)!, columns });
    usedColumns.set(n.id, used);
  });

  const findNode = (ref: string): NodeType | undefined =>
    nodes.find(n => n.id === ref) ?? nodes.find(n => n.label === ref);

  const addFk = (
    childId: string,
    parentId: string,
    unique: boolean,
    kind: ErRelation['kind'],
    relId: string
  ) => {
    const child = tables.get(childId);
    const parent = tables.get(parentId);
    if (!child || !parent) return;
    const colName = uniqueName(`${parent.name}_id`, usedColumns.get(childId)!);
    child.columns.push({
      name: colName,
      sqlType: 'BIGINT',
      pk: false,
      fk: { table: parent.name, column: 'id' },
      unique,
    });
    relations.push({
      id: relId,
      fromTable: childId,
      toTable: parentId,
      column: colName,
      oneToOne: unique,
      kind,
    });
  };

  // Clases asociativas: sus dos FK salen de `relaciona`. Sus aristas ya no generan columnas.
  const handledAssociative = new Set<string>();
  nodes
    .filter(n => n.asociativa && n.relaciona && n.relaciona.length > 0)
    .forEach(n => {
      const targets = (n.relaciona ?? [])
        .map(ref => findNode(ref))
        .filter((t): t is NodeType => !!t && !t.asociativa);
      if (targets.length === 0) return;
      handledAssociative.add(n.id);
      tables.get(n.id)!.junction = true;
      targets.forEach(t => addFk(n.id, t.id, false, 'asociativa', `${n.id}->${t.id}`));
    });

  edges.forEach(e => {
    if (handledAssociative.has(e.source) || handledAssociative.has(e.target)) return;
    if (!tables.has(e.source) || !tables.has(e.target)) return;
    if (e.tipo === 'dependencia') return;

    // Herencia: la hija (origen) guarda la FK única hacia el padre (destino)
    if (e.tipo === 'herencia') {
      addFk(e.source, e.target, true, 'herencia', e.id);
      return;
    }

    const o = e.multiplicidadOrigen;
    const d = e.multiplicidadDestino;

    if (o === '*' && d === '*') {
      // Muchos a muchos directo: se crea la tabla intermedia
      const a = tables.get(e.source)!;
      const b = tables.get(e.target)!;
      const names = usedTableNames;
      const junctionName = uniqueName(`${a.name}_${b.name}`, names);
      const junctionId = `junction_${e.id}`;
      const colA = `${a.name}_id`;
      const colB = a.name === b.name ? `${b.name}_id_2` : `${b.name}_id`;
      tables.set(junctionId, {
        id: junctionId,
        name: junctionName,
        synthetic: true,
        junction: true,
        compositePk: [colA, colB],
        columns: [
          { name: colA, sqlType: 'BIGINT', pk: true, fk: { table: a.name, column: 'id' } },
          { name: colB, sqlType: 'BIGINT', pk: true, fk: { table: b.name, column: 'id' } },
        ],
      });
      relations.push(
        { id: `${e.id}-a`, fromTable: junctionId, toTable: a.id, column: colA, oneToOne: false, kind: e.tipo },
        { id: `${e.id}-b`, fromTable: junctionId, toTable: b.id, column: colB, oneToOne: false, kind: e.tipo }
      );
      return;
    }

    if (o === '*' && d === '1') {
      // Muchos en el origen: la FK va en el origen y apunta al destino
      addFk(e.source, e.target, false, e.tipo, e.id);
    } else if (o === '1' && d === '*') {
      // Muchos en el destino: la FK va en el destino y apunta al origen
      addFk(e.target, e.source, false, e.tipo, e.id);
    } else {
      // 1:1: FK única en el destino
      addFk(e.target, e.source, true, e.tipo, e.id);
    }
  });

  return { tables: [...tables.values()], relations };
};
