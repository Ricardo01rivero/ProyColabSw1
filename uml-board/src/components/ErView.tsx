import React, { useMemo } from 'react';
import type { NodeType, EdgeType } from '../utils/umlConstants';
import { buildErModel } from '../utils/erModel';
import type { ErTable } from '../utils/erModel';

// Vista Entidad-Relación en notación pata de gallo, derivada del diagrama de clases (solo lectura)

const TABLE_W = 280;
const HEADER_H = 34;
const ROW_H = 24;
const PAD = 8;
const GAP_X = 90;
const GAP_Y = 70;
const MARGIN = 50;

const tableHeight = (t: ErTable) => HEADER_H + t.columns.length * ROW_H + PAD;

interface Box {
  table: ErTable;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Props = {
  nodes: NodeType[];
  edges: EdgeType[];
  /** Distancia desde arriba (alto de la barra de herramientas) */
  top: number;
};

// Punto donde la línea centro-a-centro sale del borde de la caja
const edgePoint = (box: Box, toward: { x: number; y: number }) => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(
    dx === 0 ? Infinity : box.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.h / 2 / Math.abs(dy)
  );
  return { x: cx + dx * t, y: cy + dy * t };
};

// Marcas de cardinalidad en el extremo p; d es el vector unitario que sale de la caja hacia la línea
const oneMark = (p: { x: number; y: number }, d: { x: number; y: number }) => {
  const n = { x: -d.y, y: d.x };
  const tick = (dist: number) =>
    `M ${p.x + d.x * dist + n.x * 8} ${p.y + d.y * dist + n.y * 8} L ${p.x + d.x * dist - n.x * 8} ${p.y + d.y * dist - n.y * 8}`;
  return `${tick(14)} ${tick(20)}`;
};

const manyMark = (p: { x: number; y: number }, d: { x: number; y: number }) => {
  const n = { x: -d.y, y: d.x };
  const tip = { x: p.x + d.x * 18, y: p.y + d.y * 18 };
  return [
    `M ${tip.x} ${tip.y} L ${p.x + n.x * 9} ${p.y + n.y * 9}`,
    `M ${tip.x} ${tip.y} L ${p.x} ${p.y}`,
    `M ${tip.x} ${tip.y} L ${p.x - n.x * 9} ${p.y - n.y * 9}`,
  ].join(' ');
};

const ErView: React.FC<Props> = ({ nodes, edges, top }) => {
  const { boxes, relations, width, height } = useMemo(() => {
    const model = buildErModel(nodes, edges);
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Acomodo en cuadrícula: las tablas del ER son más altas que las clases, así que no se reutilizan
    // las posiciones del diagrama (se encimarían). Se mantiene el orden de las clases en pantalla
    // (de arriba hacia abajo y de izquierda a derecha) para que se parezca al diagrama original.
    const ordered = [...model.tables].sort((a, b) => {
      const na = nodeById.get(a.id);
      const nb = nodeById.get(b.id);
      const ay = na ? Math.round(na.y / 150) : 9999;
      const by = nb ? Math.round(nb.y / 150) : 9999;
      if (ay !== by) return ay - by;
      return (na?.x ?? 0) - (nb?.x ?? 0);
    });

    const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
    const rows: ErTable[][] = [];
    ordered.forEach((t, i) => {
      const r = Math.floor(i / cols);
      rows[r] = rows[r] ?? [];
      rows[r].push(t);
    });

    const result: Box[] = [];
    let y = MARGIN;
    rows.forEach(row => {
      const rowH = Math.max(...row.map(tableHeight));
      row.forEach((t, c) => {
        result.push({ table: t, x: MARGIN + c * (TABLE_W + GAP_X), y, w: TABLE_W, h: tableHeight(t) });
      });
      y += rowH + GAP_Y;
    });

    const w = MARGIN * 2 + cols * TABLE_W + (cols - 1) * GAP_X;
    return { boxes: result, relations: model.relations, width: w, height: y };
  }, [nodes, edges]);

  const boxById = new Map(boxes.map(b => [b.table.id, b]));
  const hasData = boxes.length > 0;

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2000,
        background: '#f5f5f5',
        overflow: 'auto',
      }}
    >
      {!hasData ? (
        <div style={{ padding: 40, color: '#666', fontSize: 16 }}>
          No hay clases todavía. Crea clases en la vista de Clases para ver el modelo ER.
        </div>
      ) : (
        <svg width={Math.max(width, 600)} height={Math.max(height + 60, 400)} style={{ display: 'block' }}>
          {/* Relaciones (detrás de las tablas) */}
          {relations.map(r => {
            const child = boxById.get(r.fromTable);
            const parent = boxById.get(r.toTable);
            if (!child || !parent) return null;
            const cc = { x: child.x + child.w / 2, y: child.y + child.h / 2 };
            const pc = { x: parent.x + parent.w / 2, y: parent.y + parent.h / 2 };
            const a = edgePoint(child, pc);
            const b = edgePoint(parent, cc);
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const dirChild = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }; // sale del hijo hacia el padre
            const dirParent = { x: -dirChild.x, y: -dirChild.y };
            const dashed = r.kind === 'dependencia';
            return (
              <g key={r.id} stroke='#37474f' strokeWidth={1.8} fill='none'>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={dashed ? '6 4' : undefined} />
                <path d={r.oneToOne ? oneMark(a, dirChild) : manyMark(a, dirChild)} />
                <path d={oneMark(b, dirParent)} />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  fontSize={11}
                  fill='#546e7a'
                  stroke='none'
                  textAnchor='middle'
                  style={{ paintOrder: 'stroke', stroke: '#f5f5f5', strokeWidth: 3 }}
                >
                  {r.column}
                </text>
              </g>
            );
          })}

          {/* Tablas */}
          {boxes.map(({ table, x, y, w, h }) => (
            <g key={table.id} transform={`translate(${x},${y})`}>
              <rect width={w} height={h} rx={8} fill='#fff' stroke='#90a4ae' strokeWidth={1.5} />
              <path
                d={`M 0 ${HEADER_H} L 0 8 Q 0 0 8 0 L ${w - 8} 0 Q ${w} 0 ${w} 8 L ${w} ${HEADER_H} Z`}
                fill={table.junction ? '#00897b' : '#1976d2'}
              />
              <text x={w / 2} y={HEADER_H / 2 + 5} textAnchor='middle' fontSize={15} fontWeight={700} fill='#fff'>
                {table.name}
              </text>
              {table.columns.map((c, i) => {
                const ry = HEADER_H + i * ROW_H;
                return (
                  <g key={c.name}>
                    {i > 0 && <line x1={0} x2={w} y1={ry} y2={ry} stroke='#eceff1' />}
                    <text x={10} y={ry + 16} fontSize={11} fontWeight={700} fill={c.pk ? '#f9a825' : '#1976d2'}>
                      {c.pk && c.fk ? 'PK,FK' : c.pk ? 'PK' : c.fk ? 'FK' : ''}
                    </text>
                    <text x={56} y={ry + 16} fontSize={13} fill='#263238' fontWeight={c.pk ? 700 : 400}>
                      {c.name}
                    </text>
                    <text x={w - 10} y={ry + 16} fontSize={12} fill='#78909c' textAnchor='end'>
                      {c.sqlType}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}

      {/* Leyenda */}
      <div
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          background: '#fff',
          border: '1px solid #cfd8dc',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: '#37474f',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          lineHeight: 1.6,
        }}
      >
        <strong>Notación pata de gallo</strong>
        <div>PK: clave primaria · FK: clave foránea</div>
        <div>Tres ramas = muchos · dos barras = uno</div>
        <div>Tabla verde = tabla intermedia (muchos a muchos)</div>
      </div>
    </div>
  );
};

export default ErView;
