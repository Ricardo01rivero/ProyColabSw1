import React, { useState, useEffect } from 'react';
import type { NodeType } from '../utils/umlConstants';
import { NODE_WIDTH, NODE_HEIGHT, ATTR_HEIGHT } from '../utils/umlConstants';

interface CurrentMultiplicity {
  source: string;
  target: string;
}

declare global {
  interface Window {
    currentMultiplicity?: CurrentMultiplicity;
  }
}

type Props = {
  node: NodeType;
  onMouseDown: (e: React.MouseEvent, node: NodeType) => void;
  addAttribute: (id: string) => void;
  onStartRelation: (id: string, type: string) => void;
  relationMode: boolean;
  isRelationOrigin: boolean;
  onSelectAsTarget: (id: string) => void;
  onClick?: () => void;
  onEditLabel: (id: string, newLabel: string) => void;
  onEditAttribute: (
    nodeId: string,
    attrIdx: number,
    field: 'name' | 'scope' | 'datatype',
    newValue: string
  ) => void;
  onDeleteAttribute: (nodeId: string, attrIdx: number) => void;
  onDeleteNode?: (id: string) => void;
  isLocked?: boolean;
};

const nodeStyle = (n: NodeType, relationMode: boolean): React.CSSProperties => ({
  position: 'absolute',
  left: n.x,
  top: n.y,
  width: NODE_WIDTH,
  height: n.height ?? NODE_HEIGHT,
  border: '1px solid #000', // Todas las clases con el mismo borde
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  cursor: relationMode ? 'pointer' : 'move',
  background: relationMode ? '#e6f7ff' : '#fff', // Todas las clases con el mismo fondo
  boxSizing: 'border-box',
  borderRadius: 8, // Todas las clases con el mismo radio
  overflow: 'hidden',
});

const selectStyle: React.CSSProperties = {
  fontSize: 13,
  border: 'none',
  background: 'transparent',
  outline: 'none',
  padding: '2px 6px',
  marginRight: 4,
  minWidth: 32,
  maxWidth: 80,
  height: 24,
  boxShadow: 'none',
  appearance: 'none',
};

const inputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  width: 70,
  marginRight: 4,
  outline: 'none',
};

const RELATION_TYPES = [
  { label: 'Asociación', value: 'asociacion' },
  { label: 'Agregación', value: 'agregacion' },
  { label: 'Composición', value: 'composicion' },
  { label: 'Herencia', value: 'herencia' },
  { label: 'Dependencia', value: 'dependencia' }, // <-- nuevo tipo
];

const Node: React.FC<Props> = ({
  node,
  onMouseDown,
  addAttribute,
  onStartRelation,
  relationMode,
  isRelationOrigin,
  onSelectAsTarget,
  onClick,
  onEditLabel,
  onEditAttribute,
  onDeleteAttribute,
  onDeleteNode,
  isLocked = false,
}) => {
  // 🔴 Estado local para edición de label (evita guardados constantes)
  const [localLabel, setLocalLabel] = useState(node.label);
  const [showMenu, setShowMenu] = useState(false);
  const [showMultiplicityMenu, setShowMultiplicityMenu] = useState(false);
  const [selectedRelationType, setSelectedRelationType] = useState<string | null>(null);
  const [hoveredAttr, setHoveredAttr] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);

  // 🔄 Sincronizar label local cuando el nodo cambie desde fuera (sync colaborativo)
  useEffect(() => {
    setLocalLabel(node.label);
  }, [node.label]);

  return (
    <div
      style={nodeStyle(node, relationMode)}
      onMouseDown={e => {
        if (!relationMode && !isLocked) {
          onMouseDown(e, node);
        }
      }}
      onClick={() => {
        if (relationMode && !isRelationOrigin) onSelectAsTarget(node.id);
        if (onClick) onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        // Cerrar menús al salir del hover
        setShowMenu(false);
        setShowMultiplicityMenu(false);
      }}
    >
      {/* Botón eliminar clase */}
      {hovered && onDeleteNode && !isLocked && (
        <button
          onClick={e => {
            e.stopPropagation();
            onDeleteNode(node.id);
          }}
          title='Eliminar clase'
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 22,
            height: 22,
            border: 'none',
            background: '#fff',
            color: '#c00',
            fontSize: 16,
            cursor: 'pointer',
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: 10,
          }}
        >
          ✕
        </button>
      )}
      <div style={{ width: '100%', textAlign: 'center', fontWeight: 'bold', marginTop: 8 }}>
        <input
          type='text'
          value={localLabel}
          onChange={e => setLocalLabel(e.target.value)}
          onBlur={() => {
            // Solo guardar si el valor cambió
            if (localLabel !== node.label) {
              onEditLabel(node.id, localLabel);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.currentTarget.blur(); // Guardar al presionar Enter
            }
          }}
          disabled={isLocked}
          style={{
            width: '96%',
            fontWeight: 'bold',
            fontSize: 17,
            textAlign: 'center',
            border: 'none',
            background: 'transparent',
            outline: 'none',
            cursor: isLocked ? 'not-allowed' : 'text',
            opacity: isLocked ? 0.6 : 1,
          }}
        />
      </div>
      <div style={{ width: '100%', maxHeight: '70%', overflowY: 'auto', marginTop: 4 }}>
        {(node.attributes ?? []).map((attr, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 2,
              width: '100%',
              minHeight: ATTR_HEIGHT,
              boxSizing: 'border-box',
              position: 'relative',
            }}
            onMouseEnter={() => setHoveredAttr(idx)}
            onMouseLeave={() => setHoveredAttr(null)}
          >
            <select
              value={attr.scope}
              onChange={e => onEditAttribute(node.id, idx, 'scope', e.target.value)}
              disabled={isLocked}
              style={selectStyle}
            >
              <option value='public'>+</option>
              <option value='protected'>#</option>
              <option value='private'>-</option>
            </select>
            <input
              type='text'
              value={attr.name}
              onChange={e => onEditAttribute(node.id, idx, 'name', e.target.value)}
              disabled={isLocked}
              style={inputStyle}
            />
            <select
              value={attr.datatype}
              onChange={e => onEditAttribute(node.id, idx, 'datatype', e.target.value)}
              disabled={isLocked}
              style={{ ...selectStyle, marginLeft: 4, maxWidth: 90 }}
            >
              <option value='Integer'>Integer</option>
              <option value='Float'>Float</option>
              <option value='Boolean'>Boolean</option>
              <option value='Date'>Date</option>
              <option value='String'>String</option>
            </select>
            {hoveredAttr === idx && !isLocked && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDeleteAttribute(node.id, idx);
                }}
                title='Eliminar atributo'
                style={{
                  position: 'absolute',
                  right: 2,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  color: '#c00',
                  fontSize: 16,
                  cursor: 'pointer',
                  opacity: 0.8,
                  transition: 'opacity 0.2s',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Botón agregar atributo - solo visible en hover */}
      {hovered && !isLocked && (
        <button
          onClick={e => {
            e.stopPropagation();
            addAttribute(node.id);
          }}
          title='Agregar atributo'
          style={{
            position: 'absolute',
            bottom: 8,
            right: 40,
            width: 24,
            height: 24,
            border: 'none',
            background: '#fff',
            color: '#666',
            fontSize: 14,
            cursor: 'pointer',
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.background = '#f0f0f0';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '0.85';
            e.currentTarget.style.background = '#fff';
          }}
        >
          +
        </button>
      )}

      {/* Botón crear relación - solo visible en hover */}
      {hovered && !isLocked && (
        <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 1000 }}>
          <button
            onClick={e => {
              e.stopPropagation();
              setShowMenu(v => !v);
            }}
            title='Crear relación'
            style={{
              width: 24,
              height: 24,
              border: 'none',
              background: '#fff',
              color: '#666',
              fontSize: 14,
              cursor: 'pointer',
              borderRadius: '50%',
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              opacity: 0.85,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.background = '#f0f0f0';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '0.85';
              e.currentTarget.style.background = '#fff';
            }}
          >
            ⇄
          </button>
          {showMenu && (
            <div
              style={{
                position: 'fixed', // <-- Cambia a fixed para que no dependa del tamaño de la clase
                left: window.innerWidth > node.x + NODE_WIDTH ? node.x + NODE_WIDTH : node.x,
                top: node.y + (node.height ?? NODE_HEIGHT) - 32,
                background: '#fff',
                border: '1px solid #ccc',
                zIndex: 2000, // <-- Muy alto para que esté por encima de todo
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {RELATION_TYPES.map(rt => (
                <div
                  key={rt.value}
                  style={{
                    padding: '6px 16px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #eee',
                    background: 'inherit',
                  }}
                  onClick={() => {
                    if (rt.value === 'asociacion') {
                      // Para asociación, mostrar menú de multiplicidad
                      setSelectedRelationType(rt.value);
                      setShowMenu(false);
                      setShowMultiplicityMenu(true);
                    } else {
                      // Para otros tipos, crear relación directamente
                      setShowMenu(false);
                      onStartRelation(node.id, rt.value);
                    }
                  }}
                >
                  {rt.label}
                </div>
              ))}
            </div>
          )}

          {/* Menú de multiplicidad (solo para asociaciones) */}
          {showMultiplicityMenu && (
            <div
              style={{
                position: 'fixed',
                left: window.innerWidth > node.x + NODE_WIDTH ? node.x + NODE_WIDTH : node.x,
                top: node.y + (node.height ?? NODE_HEIGHT) - 32,
                background: '#fff',
                border: '1px solid #ccc',
                zIndex: 2000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '6px 16px',
                  background: '#f0f0f0',
                  borderBottom: '1px solid #eee',
                  fontSize: '12px',
                  color: '#666',
                  fontWeight: 'bold',
                }}
              >
                Seleccionar multiplicidad:
              </div>
              <div
                style={{
                  padding: '6px 16px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid #eee',
                  background: 'inherit',
                }}
                onClick={() => {
                  setShowMultiplicityMenu(false);
                  onStartRelation(node.id, `${selectedRelationType || 'asociacion'}:1:1`);
                }}
              >
                1 : 1 (Uno a Uno)
              </div>
              <div
                style={{
                  padding: '6px 16px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  borderBottom: '1px solid #eee',
                  background: 'inherit',
                }}
                onClick={() => {
                  setShowMultiplicityMenu(false);
                  onStartRelation(node.id, `${selectedRelationType || 'asociacion'}:1:*`);
                }}
              >
                1 : * (Uno a Muchos)
              </div>
              <div
                style={{
                  padding: '6px 16px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: 'inherit',
                }}
                onClick={() => {
                  setShowMultiplicityMenu(false);
                  onStartRelation(node.id, `${selectedRelationType || 'asociacion'}:*:1`);
                }}
              >
                * : 1 (Muchos a Uno)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Node;
