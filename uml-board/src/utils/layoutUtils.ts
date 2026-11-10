import { NODE_WIDTH, NODE_HEIGHT } from './umlConstants';
import type { NodeType, EdgeType } from './umlConstants';

export type LayoutType = 'grid' | 'row' | 'column' | 'circle' | 'hierarchy';

export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

const GAP_X = 80;
const GAP_Y = 80;
const START_X = 60;
const START_Y = 60;

const heightOf = (n: NodeType) => n.height ?? NODE_HEIGHT;

/**
 * Calcula posiciones nuevas para todas las clases según el tipo de orden pedido.
 * La IA solo elige el tipo; las coordenadas se calculan aquí (más confiable que pedírselas al modelo).
 */
export const computeLayout = (
  layout: LayoutType,
  nodes: NodeType[],
  edges: EdgeType[]
): NodePosition[] => {
  if (nodes.length === 0) return [];
  const cellW = NODE_WIDTH + GAP_X;
  const cellH = Math.max(...nodes.map(heightOf)) + GAP_Y;

  switch (layout) {
    case 'row':
      return nodes.map((n, i) => ({ id: n.id, x: START_X + i * cellW, y: START_Y }));

    case 'column':
      return nodes.map((n, i) => ({ id: n.id, x: START_X, y: START_Y + i * cellH }));

    case 'circle': {
      const radius = Math.max(200, (nodes.length * cellW) / (2 * Math.PI));
      const cx = START_X + radius + NODE_WIDTH / 2;
      const cy = START_Y + radius + NODE_HEIGHT / 2;
      return nodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        return {
          id: n.id,
          x: Math.round(cx + radius * Math.cos(angle) - NODE_WIDTH / 2),
          y: Math.round(cy + radius * Math.sin(angle) - NODE_HEIGHT / 2),
        };
      });
    }

    case 'hierarchy': {
      // Padre = destino de una relación de herencia (Hijo -> Padre)
      const parentOf = new Map<string, string>();
      edges
        .filter(e => e.tipo === 'herencia')
        .forEach(e => parentOf.set(e.source, e.target));

      const levelOf = (id: string): number => {
        let level = 0;
        const seen = new Set<string>([id]);
        let current = parentOf.get(id);
        while (current && !seen.has(current)) {
          seen.add(current);
          level++;
          current = parentOf.get(current);
        }
        return level;
      };

      // Las clases sin padre quedan arriba; el resto baja un nivel por cada herencia
      const levels = new Map<number, NodeType[]>();
      nodes.forEach(n => {
        const lv = levelOf(n.id);
        levels.set(lv, [...(levels.get(lv) ?? []), n]);
      });

      const result: NodePosition[] = [];
      [...levels.keys()]
        .sort((a, b) => a - b)
        .forEach(lv => {
          levels.get(lv)!.forEach((n, i) => {
            result.push({ id: n.id, x: START_X + i * cellW, y: START_Y + lv * cellH });
          });
        });
      return result;
    }

    case 'grid':
    default: {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      return nodes.map((n, i) => ({
        id: n.id,
        x: START_X + (i % cols) * cellW,
        y: START_Y + Math.floor(i / cols) * cellH,
      }));
    }
  }
};
