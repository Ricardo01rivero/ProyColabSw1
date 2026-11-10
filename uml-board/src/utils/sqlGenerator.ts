import { saveAs } from 'file-saver';
import type { NodeType, EdgeType } from './umlConstants';
import { buildErModel, toSnake } from './erModel';
import type { ErModel, ErTable } from './erModel';

// Palabras reservadas de PostgreSQL que podrían usarse como nombre de clase
const RESERVED = new Set([
  'user', 'order', 'group', 'table', 'select', 'where', 'from', 'check', 'column',
  'default', 'end', 'index', 'limit', 'offset', 'primary', 'references', 'unique', 'all', 'analyse',
]);

const ident = (name: string): string => (RESERVED.has(name) ? `"${name}"` : name);

const columnLine = (t: ErTable, col: ErTable['columns'][number]): string => {
  const parts = [`  ${ident(col.name)} ${col.sqlType}`];
  if (col.pk && !t.compositePk) parts.push('PRIMARY KEY');
  else if (col.pk) parts.push('NOT NULL');
  if (col.unique) parts.push('UNIQUE');
  return parts.join(' ');
};

const createTable = (t: ErTable): string => {
  const lines = t.columns.map(c => columnLine(t, c));
  if (t.compositePk) {
    lines.push(`  PRIMARY KEY (${t.compositePk.map(ident).join(', ')})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${ident(t.name)} (\n${lines.join(',\n')}\n);`;
};

/**
 * Genera el script SQL para PostgreSQL a partir del modelo ER.
 * Primero se crean todas las tablas y después las claves foráneas (ALTER TABLE),
 * así el orden de creación nunca es un problema, ni siquiera con relaciones circulares.
 */
export const generateSqlFromModel = (model: ErModel, diagramName: string): string => {
  const header = [
    `-- Script SQL para PostgreSQL generado desde el diagrama "${diagramName}"`,
    `-- Generado: ${new Date().toISOString().slice(0, 10)}`,
    '',
  ];

  const tablesSql = model.tables.map(createTable).join('\n\n');

  const byId = new Map(model.tables.map(t => [t.id, t]));
  const fkSql = model.relations
    .map(r => {
      const child = byId.get(r.fromTable);
      const parent = byId.get(r.toTable);
      if (!child || !parent) return '';
      const constraint = `fk_${child.name}_${toSnake(r.column)}`;
      return (
        `ALTER TABLE ${ident(child.name)}\n` +
        `  ADD CONSTRAINT ${constraint} FOREIGN KEY (${ident(r.column)})\n` +
        `  REFERENCES ${ident(parent.name)} (id) ON DELETE CASCADE;`
      );
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    ...header,
    '-- Tablas',
    tablesSql,
    '',
    ...(fkSql ? ['-- Claves foráneas', fkSql, ''] : []),
  ].join('\n');
};

export const generateSql = (nodes: NodeType[], edges: EdgeType[], diagramName: string): string =>
  generateSqlFromModel(buildErModel(nodes, edges), diagramName);

/** Descarga el SQL como archivo .sql */
export const exportarSql = (nodes: NodeType[], edges: EdgeType[], diagramName: string): void => {
  const sql = generateSql(nodes, edges, diagramName);
  const fileName = `${toSnake(diagramName) || 'diagrama'}.sql`;
  saveAs(new Blob([sql], { type: 'text/sql;charset=utf-8' }), fileName);
};
