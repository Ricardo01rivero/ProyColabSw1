/**
 * Intercambio con Enterprise Architect (EA) mediante XMI 2.1 (estándar OMG para modelos UML).
 *
 * - exportToXMI: genera un .xmi que EA importa con "Publish/Import > Import Package from XMI".
 *   Incluye clases, atributos (visibilidad y tipo), asociación, agregación, composición, herencia,
 *   dependencia, multiplicidades y un diagrama con las posiciones de la pizarra.
 * - importFromXMI: lee un .xmi exportado desde EA (Publish > Export to XMI 2.1) o desde esta app
 *   y lo convierte a clases y relaciones de la pizarra.
 *
 * Convenciones de la pizarra (ver EdgeLayer.tsx):
 *   agregación/composición: el rombo está en el ORIGEN (source = todo, target = parte).
 *   herencia: source = hija, target = padre.   dependencia: source depende de target.
 */
import type { AttributeType, EdgeType, NodeType } from './umlConstants';

type Datatype = AttributeType['datatype'];
type Scope = AttributeType['scope'];

// Escala entre coordenadas de la pizarra y de EA
const SCALE = 1;
const UML_PRIMITIVES = 'http://schema.omg.org/spec/UML/2.1/uml.xml#';
const TYPES: Datatype[] = ['Integer', 'Float', 'Boolean', 'Date', 'String'];

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const newId = (prefix = 'EAID') => {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
  return `${prefix}_${hex(8)}_${hex(4)}_${hex(4)}_${hex(4)}_${hex(12)}`;
};

const multiplicity = (m: '1' | '*', idBase: string) =>
  m === '*'
    ? `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idBase}_L" value="0"/>` +
      `<upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idBase}_U" value="-1"/>`
    : `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idBase}_L" value="1"/>` +
      `<upperValue xmi:type="uml:LiteralInteger" xmi:id="${idBase}_U" value="1"/>`;

/** Genera el XMI 2.1 (compatible con Enterprise Architect) del diagrama. */
export function exportToXMI(nodes: NodeType[], edges: EdgeType[], modelName = 'Diagrama UML Board'): string {
  const pkgId = newId('EAPK');
  const diagramId = newId();
  // EA reconoce los tipos primitivos por el prefijo EAJava_<nombre>
  const typeId = (t: Datatype) => `EAJava_${t}`;
  const classId = new Map<string, string>();
  nodes.forEach(n => classId.set(n.id, newId()));

  const generalizations = new Map<string, string[]>(); // hija -> xml
  const relations: string[] = [];
  const diagramLinks: string[] = [];

  for (const e of edges) {
    const src = classId.get(e.source);
    const dst = classId.get(e.target);
    if (!src || !dst) continue;
    const id = newId();
    diagramLinks.push(id);

    if (e.tipo === 'herencia') {
      const list = generalizations.get(e.source) || [];
      list.push(`<generalization xmi:type="uml:Generalization" xmi:id="${id}" general="${dst}"/>`);
      generalizations.set(e.source, list);
      continue;
    }
    if (e.tipo === 'dependencia') {
      relations.push(
        `<packagedElement xmi:type="uml:Dependency" xmi:id="${id}" visibility="public" supplier="${dst}" client="${src}"/>`
      );
      continue;
    }
    // Asociación / agregación / composición. En UML la propiedad que lleva "aggregation" es el
    // extremo de la PARTE (su opuesto es el todo, donde se dibuja el rombo).
    const agg = e.tipo === 'composicion' ? 'composite' : e.tipo === 'agregacion' ? 'shared' : 'none';
    const srcEnd = `${id}_src`;
    const dstEnd = `${id}_dst`;
    relations.push(
      `<packagedElement xmi:type="uml:Association" xmi:id="${id}" visibility="public">` +
        `<memberEnd xmi:idref="${dstEnd}"/><memberEnd xmi:idref="${srcEnd}"/>` +
        `<ownedEnd xmi:type="uml:Property" xmi:id="${srcEnd}" visibility="public" association="${id}" aggregation="none">` +
        `<type xmi:idref="${src}"/>${multiplicity(e.multiplicidadOrigen, srcEnd)}</ownedEnd>` +
        `<ownedEnd xmi:type="uml:Property" xmi:id="${dstEnd}" visibility="public" association="${id}" aggregation="${agg}">` +
        `<type xmi:idref="${dst}"/>${multiplicity(e.multiplicidadDestino, dstEnd)}</ownedEnd>` +
        `</packagedElement>`
    );
  }

  const classes = nodes.map(n => {
    const id = classId.get(n.id)!;
    const attrs = (n.attributes || [])
      .map((a, i) => {
        const t = TYPES.includes(a.datatype) ? a.datatype : 'String';
        return (
          `<ownedAttribute xmi:type="uml:Property" xmi:id="${id}_A${i}" name="${esc(a.name)}" visibility="${a.scope || 'private'}" isOrdered="false" isUnique="true">` +
          `<type xmi:idref="${typeId(t)}"/></ownedAttribute>`
        );
      })
      .join('');
    const gens = (generalizations.get(n.id) || []).join('');
    return `<packagedElement xmi:type="uml:Class" xmi:id="${id}" name="${esc(n.label)}" visibility="public">${attrs}${gens}</packagedElement>`;
  });

  // La pizarra admite coordenadas negativas; EA no. Se trasladan para que empiecen en (40, 40).
  const minX = Math.min(0, ...nodes.map(n => n.x));
  const minY = Math.min(0, ...nodes.map(n => n.y));
  const geometry = nodes.map((n, i) => {
    const left = Math.round((n.x - minX) * SCALE) + (minX < 0 ? 40 : 0);
    const top = Math.round((n.y - minY) * SCALE) + (minY < 0 ? 40 : 0);
    const height = 40 + 16 * Math.max(1, n.attributes?.length || 0);
    return `<element geometry="Left=${left};Top=${top};Right=${left + 200};Bottom=${top + height};" subject="${classId.get(n.id)}" seqno="${i + 1}"/>`;
  });
  // Estereotipo «asociativa» para las tablas intermedias de muchos a muchos (EA lo muestra y se recupera al importar)
  const stereotypes = nodes
    .filter(n => n.asociativa)
    .map(
      n =>
        `<element xmi:idref="${classId.get(n.id)}" xmi:type="uml:Class" name="${esc(n.label)}" scope="public"><properties sType="Class" stereotype="asociativa"/></element>`
    );
  const linkGeometry = diagramLinks.map(
    id => `<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=0;" subject="${id}"/>`
  );

  const primitives = TYPES.map(
    t =>
      `<packagedElement xmi:type="uml:PrimitiveType" xmi:id="${typeId(t)}" name="${t}" visibility="public">` +
      (['Integer', 'Boolean', 'String'].includes(t)
        ? `<generalization xmi:type="uml:Generalization" xmi:id="${typeId(t)}_G"><general href="${UML_PRIMITIVES}${t}"/></generalization>`
        : '') +
      `</packagedElement>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">
<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>
<uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">
<packagedElement xmi:type="uml:Package" xmi:id="${pkgId}" name="${esc(modelName)}" visibility="public">
${classes.join('\n')}
${relations.join('\n')}
</packagedElement>
</uml:Model>
<xmi:Extension extender="Enterprise Architect" extenderID="6.5">
<elements>
${stereotypes.join('\n')}
</elements>
<primitivetypes>
<packagedElement xmi:type="uml:Package" xmi:id="UMLB_PrimitiveTypes" name="EA_PrimitiveTypes_Package" visibility="public">${primitives}</packagedElement>
</primitivetypes>
<diagrams>
<diagram xmi:id="${diagramId}">
<model package="${pkgId}" owner="${pkgId}"/>
<properties name="${esc(modelName)}" type="Logical"/>
<elements>
${geometry.join('\n')}
${linkGeometry.join('\n')}
</elements>
</diagram>
</diagrams>
</xmi:Extension>
</xmi:XMI>
`;
}

// ------------------------------------------------------------------ importación

const typeName = (raw: string): Datatype => {
  const t = raw.toLowerCase();
  if (/^(int|integer|long|short|byte|bigint|smallint|serial|number|nat)/.test(t)) return 'Integer';
  if (/(float|double|decimal|real|numeric|money)/.test(t)) return 'Float';
  if (/^bool/.test(t)) return 'Boolean';
  if (/(date|time)/.test(t)) return 'Date';
  return 'String';
};

const scopeOf = (v: string | null): Scope =>
  v === 'public' || v === 'protected' || v === 'private' ? v : v === 'package' ? 'public' : 'private';

const isMany = (end: Element | undefined) => {
  if (!end) return false;
  const up = Array.from(end.children).find(c => c.localName === 'upperValue');
  const v = up?.getAttribute('value') ?? '1';
  return v === '-1' || v === '*' || (Number(v) || 1) > 1;
};

export interface XmiDiagram {
  nodes: NodeType[];
  edges: EdgeType[];
}

/** Lee un XMI 2.x (exportado por Enterprise Architect u otra herramienta UML). */
export function importFromXMI(xml: string): XmiDiagram {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo no es un XMI/XML válido');

  const all = Array.from(doc.getElementsByTagName('*'));
  const xmiType = (el: Element) => el.getAttribute('xmi:type') || '';
  const byId = new Map<string, Element>();
  for (const el of all) {
    const id = el.getAttribute('xmi:id');
    if (id) byId.set(id, el);
  }
  // Tipo de un atributo o extremo: atributo type="id", o hijo <type xmi:idref="..."/> / <type href="...#Nombre"/>
  const typeRef = (el: Element): { id?: string; name?: string } => {
    const attr = el.getAttribute('type');
    if (attr) return { id: attr, name: byId.get(attr)?.getAttribute('name') || undefined };
    const t = Array.from(el.children).find(c => c.localName === 'type');
    if (!t) return {};
    const idref = t.getAttribute('xmi:idref');
    if (idref) return { id: idref, name: byId.get(idref)?.getAttribute('name') || idref.replace(/^EAJava_|^EAnone_/, '') };
    const href = t.getAttribute('href');
    return href ? { name: href.split('#').pop() } : {};
  };

  const classEls = all.filter(
    el =>
      (el.localName === 'packagedElement' || el.localName === 'nestedClassifier' || el.localName === 'ownedMember') &&
      (xmiType(el) === 'uml:Class' || xmiType(el) === 'uml:AssociationClass')
  );
  if (!classEls.length) throw new Error('El XMI no contiene clases UML');

  // Posiciones del primer diagrama de EA que tenga estas clases
  const pos = new Map<string, { x: number; y: number }>();
  for (const el of Array.from(doc.getElementsByTagName('element'))) {
    const subject = el.getAttribute('subject');
    const m = /Left=(-?\d+);Top=(-?\d+);/.exec(el.getAttribute('geometry') || '');
    if (subject && m && !pos.has(subject)) pos.set(subject, { x: +m[1], y: Math.abs(+m[2]) });
  }

  // Origen/destino de los conectores según la extensión de EA (si existe)
  const connectorEnds = new Map<string, { source: string; target: string }>();
  for (const c of Array.from(doc.getElementsByTagName('connector'))) {
    const id = c.getAttribute('xmi:idref');
    const s = Array.from(c.children).find(x => x.localName === 'source')?.getAttribute('xmi:idref');
    const t = Array.from(c.children).find(x => x.localName === 'target')?.getAttribute('xmi:idref');
    if (id && s && t) connectorEnds.set(id, { source: s, target: t });
  }

  // Estereotipos que EA guarda en su extensión (<element xmi:idref><properties stereotype/>)
  const stereotypeOf = new Map<string, string>();
  for (const el of Array.from(doc.getElementsByTagName('element'))) {
    const ref = el.getAttribute('xmi:idref');
    const st = Array.from(el.children).find(c => c.localName === 'properties')?.getAttribute('stereotype');
    if (ref && st) stereotypeOf.set(ref, st.toLowerCase());
  }

  const ts = Date.now();
  const nodeId = new Map<string, string>();
  const nodes: NodeType[] = classEls.map((el, i) => {
    const id = `xmi_${ts}_${i}`;
    nodeId.set(el.getAttribute('xmi:id') || id, id);
    const attributes: AttributeType[] = Array.from(el.children)
      .filter(c => c.localName === 'ownedAttribute' && !c.getAttribute('association') && c.getAttribute('name'))
      .map(c => ({
        name: c.getAttribute('name')!,
        scope: scopeOf(c.getAttribute('visibility')),
        datatype: typeName(typeRef(c).name || 'String'),
      }));
    const p = pos.get(el.getAttribute('xmi:id') || '');
    return {
      id,
      label: el.getAttribute('name') || `Clase${i + 1}`,
      x: p ? Math.round(p.x / SCALE) : 80 + (i % 4) * 300,
      y: p ? Math.round(p.y / SCALE) : 80 + Math.floor(i / 4) * 260,
      attributes,
    };
  });

  const edges: EdgeType[] = [];
  let k = 0;
  const addEdge = (source: string, target: string, tipo: EdgeType['tipo'], mo: '1' | '*' = '1', md: '1' | '*' = '1') => {
    const s = nodeId.get(source);
    const t = nodeId.get(target);
    if (s && t) edges.push({ id: `xmi_${ts}_e${k++}`, source: s, target: t, tipo, multiplicidadOrigen: mo, multiplicidadDestino: md });
  };

  // Herencia: <generalization general="padre"/> dentro de la clase hija
  for (const el of classEls) {
    for (const g of Array.from(el.children).filter(c => c.localName === 'generalization')) {
      const parent = g.getAttribute('general') || Array.from(g.children).find(c => c.localName === 'general')?.getAttribute('xmi:idref');
      if (parent) addEdge(el.getAttribute('xmi:id')!, parent, 'herencia');
    }
  }

  // Dependencias (y Usage, que es un tipo de dependencia)
  for (const el of all.filter(e => ['uml:Dependency', 'uml:Usage'].includes(xmiType(e)))) {
    const client = el.getAttribute('client') || Array.from(el.children).find(c => c.localName === 'client')?.getAttribute('xmi:idref');
    const supplier = el.getAttribute('supplier') || Array.from(el.children).find(c => c.localName === 'supplier')?.getAttribute('xmi:idref');
    if (client && supplier) addEdge(client, supplier, 'dependencia');
  }

  // Asociaciones, agregaciones, composiciones y clases de asociación
  const assocEls = all.filter(
    e => e.localName === 'packagedElement' && ['uml:Association', 'uml:AssociationClass'].includes(xmiType(e))
  );
  for (const a of assocEls) {
    const aId = a.getAttribute('xmi:id') || '';
    const refs = [
      ...(a.getAttribute('memberEnd') || '').split(/\s+/).filter(Boolean),
      ...Array.from(a.children).filter(c => c.localName === 'memberEnd').map(c => c.getAttribute('xmi:idref') || ''),
    ];
    const ends = refs.map(r => byId.get(r)).filter((e): e is Element => !!e);
    if (ends.length < 2) continue;
    const endType = (e: Element) => typeRef(e).id || '';

    if (xmiType(a) === 'uml:AssociationClass') {
      // Muchos a muchos: la clase de asociación queda como tabla intermedia (asociativa)
      const mid = nodeId.get(aId);
      const n = nodes.find(x => x.id === mid);
      if (n) {
        n.asociativa = true;
        n.relaciona = [nodeId.get(endType(ends[0]))!, nodeId.get(endType(ends[1]))!];
        addEdge(endType(ends[0]), aId, 'asociacion', '1', '*');
        addEdge(endType(ends[1]), aId, 'asociacion', '1', '*');
      }
      continue;
    }

    // Origen y destino: los de EA si vienen; si no, el orden de los extremos
    const fromEA = connectorEnds.get(aId);
    let srcEnd = ends[0];
    let dstEnd = ends[1];
    if (fromEA) {
      const s = ends.find(e => endType(e) === fromEA.source);
      const t = ends.find(e => e !== s && endType(e) === fromEA.target);
      if (s && t) {
        srcEnd = s;
        dstEnd = t;
      }
    } else if (/_src$/.test(ends[1].getAttribute('xmi:id') || '')) {
      srcEnd = ends[1];
      dstEnd = ends[0];
    }

    const aggOf = (e: Element) => e.getAttribute('aggregation') || 'none';
    const aggEnd = [srcEnd, dstEnd].find(e => aggOf(e) !== 'none');
    if (aggEnd) {
      // El extremo con "aggregation" es la parte; el todo (donde va el rombo) es el otro
      const part = aggEnd;
      const whole = part === srcEnd ? dstEnd : srcEnd;
      addEdge(endType(whole), endType(part), aggOf(part) === 'composite' ? 'composicion' : 'agregacion',
        isMany(whole) ? '*' : '1', isMany(part) ? '*' : '1');
    } else {
      addEdge(endType(srcEnd), endType(dstEnd), 'asociacion', isMany(srcEnd) ? '*' : '1', isMany(dstEnd) ? '*' : '1');
    }
  }

  // Tablas intermedias marcadas «asociativa»: relaciona = las dos clases que llegan a ella
  for (const el of classEls) {
    const xid = el.getAttribute('xmi:id') || '';
    if (!/asociativa|association/.test(stereotypeOf.get(xid) || '')) continue;
    const n = nodes.find(x => x.id === nodeId.get(xid));
    const incoming = edges.filter(e => e.target === n?.id || e.source === n?.id).map(e => (e.target === n?.id ? e.source : e.target));
    if (n && incoming.length >= 2) {
      n.asociativa = true;
      n.relaciona = [incoming[0], incoming[1]];
    }
  }

  return { nodes, edges };
}
