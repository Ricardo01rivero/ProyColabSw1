import React, { useMemo, useState } from 'react';
import type { NodeType, EdgeType } from '../utils/umlConstants';
import { buildErModel } from '../utils/erModel';
import type { ErRelation, ErTable } from '../utils/erModel';

// Vista Entidad-Relación en notación pata de gallo, derivada del diagrama de clases (solo lectura)

const FONT = "'Comfortaa', 'Segoe UI', system-ui, sans-serif";

const TABLE_W = 340;
const HEADER_H = 46;
const ROW_H = 32;
const PAD = 10;
const GAP_X = 110;
const GAP_Y = 80;
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
    `M ${p.x + d.x * dist + n.x * 9} ${p.y + d.y * dist + n.y * 9} L ${p.x + d.x * dist - n.x * 9} ${p.y + d.y * dist - n.y * 9}`;
  return `${tick(15)} ${tick(22)}`;
};

const manyMark = (p: { x: number; y: number }, d: { x: number; y: number }) => {
  const n = { x: -d.y, y: d.x };
  const tip = { x: p.x + d.x * 20, y: p.y + d.y * 20 };
  return [
    `M ${tip.x} ${tip.y} L ${p.x + n.x * 10} ${p.y + n.y * 10}`,
    `M ${tip.x} ${tip.y} L ${p.x} ${p.y}`,
    `M ${tip.x} ${tip.y} L ${p.x - n.x * 10} ${p.y - n.y * 10}`,
  ].join(' ');
};

/** Explicación en lenguaje natural de una relación, para el tooltip al pasar el cursor */
const explain = (r: ErRelation, child: string, parent: string): { title: string; lines: string[] } => {
  const fk = `${child}.${r.column} → ${parent}.id`;
  const cascade = `Si se borra un registro de «${parent}», se borran también los de «${child}» que dependen de él.`;

  if (r.kind === 'asociativa') {
    return {
      title: `Tabla intermedia (muchos a muchos)`,
      lines: [
        `«${child}» une registros de «${parent}» con los de otra tabla.`,
        `Cada fila de «${child}» apunta a un registro de «${parent}» mediante ${r.column}.`,
        `Clave foránea: ${fk}`,
        cascade,
      ],
    };
  }
  if (r.kind === 'herencia') {
    return {
      title: 'Herencia (uno a uno)',
      lines: [
        `«${child}» es un tipo de «${parent}»: hereda sus datos.`,
        `Cada «${child}» corresponde a un solo «${parent}», y esa clave es única.`,
        `Clave foránea: ${fk}`,
        cascade,
      ],
    };
  }

  const nature: Record<string, string> = {
    composicion: 'Composición: «' + child + '» no puede existir sin «' + parent + '».',
    agregacion: 'Agregación: «' + parent + '» agrupa a «' + child + '», pero cada uno tiene vida propia.',
    asociacion: 'Asociación entre «' + parent + '» y «' + child + '».',
  };
  const natureLine = nature[r.kind] ?? nature.asociacion;

  if (r.oneToOne) {
    return {
      title: 'Uno a uno',
      lines: [
        natureLine,
        `Cada «${parent}» se relaciona con un solo «${child}» y viceversa.`,
        `Clave foránea única: ${fk}`,
        cascade,
      ],
    };
  }
  return {
    title: 'Uno a muchos',
    lines: [
      natureLine,
      `Un «${parent}» puede tener muchos «${child}».`,
      `Cada «${child}» pertenece a un solo «${parent}».`,
      `Clave foránea: ${fk}`,
      cascade,
    ],
  };
};

const ErView: React.FC<Props> = ({ nodes, edges, top }) => {
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);

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

  const hoveredRel = hovered ? relations.find(r => r.id === hovered.id) : undefined;
  const tip =
    hoveredRel && boxById.get(hoveredRel.fromTable) && boxById.get(hoveredRel.toTable)
      ? explain(
          hoveredRel,
          boxById.get(hoveredRel.fromTable)!.table.name,
          boxById.get(hoveredRel.toTable)!.table.name
        )
      : null;

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
        fontFamily: FONT,
      }}
    >
      {!hasData ? (
        <div style={{ padding: 40, color: '#666', fontSize: 17 }}>
          No hay clases todavía. Crea clases en la vista de Clases para ver el modelo ER.
        </div>
      ) : (
        <svg
          width={Math.max(width, 600)}
          height={Math.max(height + 60, 400)}
          style={{ display: 'block', fontFamily: FONT }}
        >
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
            const active = hovered?.id === r.id;
            return (
              <g
                key={r.id}
                stroke={active ? '#1565c0' : '#37474f'}
                strokeWidth={active ? 3 : 2}
                fill='none'
                style={{ cursor: 'help' }}
                onMouseMove={e => setHovered({ id: r.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Zona ancha invisible para que sea fácil acertar con el cursor */}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke='transparent' strokeWidth={22} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={dashed ? '6 4' : undefined} />
                <path d={r.oneToOne ? oneMark(a, dirChild) : manyMark(a, dirChild)} />
                <path d={oneMark(b, dirParent)} />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 8}
                  fontSize={12}
                  fill={active ? '#1565c0' : '#546e7a'}
                  stroke='none'
                  textAnchor='middle'
                  style={{ paintOrder: 'stroke', stroke: '#f5f5f5', strokeWidth: 4 }}
                >
                  {r.column}
                </text>
              </g>
            );
          })}

          {/* Tablas */}
          {boxes.map(({ table, x, y, w, h }) => (
            <g key={table.id} transform={`translate(${x},${y})`}>
              <rect width={w} height={h} rx={10} fill='#fff' stroke='#90a4ae' strokeWidth={1.5} />
              <path
                d={`M 0 ${HEADER_H} L 0 10 Q 0 0 10 0 L ${w - 10} 0 Q ${w} 0 ${w} 10 L ${w} ${HEADER_H} Z`}
                fill={table.junction ? '#00897b' : '#1976d2'}
              />
              <text x={w / 2} y={HEADER_H / 2 + 6} textAnchor='middle' fontSize={18} fontWeight={700} fill='#fff'>
                {table.name}
              </text>
              {table.columns.map((c, i) => {
                const ry = HEADER_H + i * ROW_H;
                const badge = c.pk && c.fk ? 'PK,FK' : c.pk ? 'PK' : c.fk ? 'FK' : '';
                const badgeHelp = c.pk
                  ? 'Clave primaria (PK): identifica cada registro de forma única'
                  : c.fk
                    ? `Clave foránea (FK): apunta a ${c.fk.table}.${c.fk.column}`
                    : '';
                return (
                  <g key={c.name}>
                    {i > 0 && <line x1={0} x2={w} y1={ry} y2={ry} stroke='#eceff1' />}
                    <text x={12} y={ry + 21} fontSize={12} fontWeight={700} fill={c.pk ? '#f9a825' : '#1976d2'}>
                      {badge}
                      {badgeHelp && <title>{badgeHelp}</title>}
                    </text>
                    <text x={70} y={ry + 21} fontSize={15} fill='#263238' fontWeight={c.pk ? 700 : 400}>
                      {c.name}
                    </text>
                    <text x={w - 12} y={ry + 21} fontSize={12.5} fill='#78909c' textAnchor='end'>
                      {c.sqlType}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      )}

      {/* Tooltip de la relación bajo el cursor */}
      {tip && hovered && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(hovered.x + 16, window.innerWidth - 380),
            top: Math.min(hovered.y + 16, window.innerHeight - 220),
            width: 360,
            background: 'rgba(33, 43, 54, 0.95)',
            color: '#fff',
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 13,
            lineHeight: 1.55,
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            zIndex: 4000,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#90caf9' }}>{tip.title}</div>
          {tip.lines.map((l, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 0 : 4, opacity: i === tip.lines.length - 1 ? 0.75 : 1 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          background: '#fff',
          border: '1px solid #cfd8dc',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 13,
          color: '#37474f',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          lineHeight: 1.7,
        }}
      >
        <strong>Notación pata de gallo</strong>
        <div>PK: clave primaria · FK: clave foránea</div>
        <div>Tres ramas = muchos · dos barras = uno</div>
        <div>Tabla verde = tabla intermedia (muchos a muchos)</div>
        <div style={{ color: '#1565c0' }}>Pasa el cursor sobre una relación para ver qué significa</div>
      </div>
    </div>
  );
};

export default ErView;
