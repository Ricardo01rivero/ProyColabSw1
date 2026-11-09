# 🤖 Guía del Asistente UML con IA

## ✅ Funcionalidades Implementadas

### 1️⃣ Crear Clases
**Comandos de ejemplo:**
- "Crea una clase Usuario con nombre tipo String y email tipo String"
- "Agrega una entidad Producto con precio tipo Float"
- "Nueva tabla Cliente con id tipo Integer"

### 2️⃣ Agregar Atributos
**Comandos de ejemplo:**
- "Agrega edad tipo Integer a la clase Usuario"
- "Añade descripción tipo String a Producto"
- "Agrega campo activo tipo Boolean a Cliente"

### 3️⃣ Crear Relaciones

#### 🔗 Relaciones con Cardinalidades Específicas

**Uno a Uno (1:1):**
- "Crea una relación 1:1 entre Usuario y Perfil"
- "Persona tiene una Dirección"
- "Asociación uno a uno entre Empleado y Escritorio"

**Uno a Muchos (1:\*):**
- "Usuario tiene muchos Pedidos"
- "Cliente tiene varios Pedidos"
- "Crea una asociación 1 a muchos entre Categoría y Producto"
- "Relación 1:* de Departamento a Empleado"

**Muchos a Uno (\*:1):**
- "Muchos Productos pertenecen a una Categoría"
- "Varios Empleados trabajan en un Departamento"
- "Asociación de muchos a uno entre Pedido y Cliente"
- "Relación *:1 de Producto a Proveedor"

**Muchos a Muchos (\*:\*) - Crea clase intermedia automáticamente:**
- "Relación muchos a muchos entre Estudiante y Curso"
- "Crear relación * a * entre Producto y Proveedor"
- "Asociación m:n entre Autor y Libro"

#### 📋 Tipos de Relaciones

**Herencia:**
- "Usuario hereda de Persona"
- "Auto extiende Vehiculo"

**Composición (contiene, parte integral):**
- "Pedido contiene DetallePedido"
- "Casa está compuesta de Habitaciones"

**Agregación (tiene, parte no integral):**
- "Departamento agrega Empleados"
- "Biblioteca agrega Libros"

**Asociación (relación general):**
- "Cliente se asocia con Pedido"
- "Usuario está relacionado con Rol"

**Dependencia (usa, depende):**
- "Servicio usa RepositorioDatos"
- "Controlador depende de Servicio"

### 4️⃣ Actualizar Clases
**Comandos de ejemplo:**
- "Cambia el nombre de Cliente a Comprador"
- "Renombra Usuario a UsuarioSistema"

### 5️⃣ ✨ ELIMINAR Clases (NUEVO)
**Comandos de ejemplo:**
- "Elimina la clase Usuario"
- "Borra la entidad Producto"
- "Quita la clase Cliente"
- "Remueve la tabla Proveedor"

### 6️⃣ ✨ ELIMINAR Atributos (NUEVO)
**Comandos de ejemplo:**
- "Elimina el atributo email de Usuario"
- "Borra el campo precio de Producto"
- "Quita la propiedad descripción de Cliente"
- "Remueve edad de Persona"

### 7️⃣ ✨ ELIMINAR Relaciones (NUEVO)
**Comandos de ejemplo:**
- "Elimina la relación entre Pedido y DetallePedido"
- "Borra la relación de Usuario a Rol"
- "Quita la asociación entre Cliente y Producto"

## 🎯 Tipos de Datos Soportados
- `String`: textos, cadenas, varchar, char
- `Integer`: números enteros, int, long
- `Float`: números decimales, double, decimal
- `Boolean`: booleanos, bool, verdadero/falso
- `Date`: fechas, datetime, timestamp

## 🔐 Scopes (Visibilidad)
- `private`: privado, - (símbolo menos)
- `public`: público, + (símbolo más)
- `protected`: protegido, # (símbolo numeral)

## 🔢 Multiplicidades
- `1`: uno, individual, único
- `*`: muchos, varios, múltiples, n

## 💡 Consejos de Uso

### Comandos Múltiples
Puedes ejecutar varias acciones en un solo prompt:
```
Crea clase Pedido con fecha tipo Date, luego crea DetallePedido con cantidad tipo Integer, 
y finalmente crea la relación de composición entre Pedido y DetallePedido
```

### Comandos por Voz 🎤
El asistente también funciona con reconocimiento de voz:
1. Haz clic en el botón del micrófono
2. Di tu comando (ejemplo: "Crea una clase Usuario con email tipo String")
3. El sistema transcribirá y ejecutará automáticamente

### Palabras Clave de Eliminación
El sistema reconoce estas palabras para eliminar:
- "elimina", "borra", "quita", "remueve", "eliminar", "borrar"

### Contexto Inteligente
El asistente conoce:
- Todas las clases existentes en el diagrama
- Todos los atributos de cada clase
- Todas las relaciones entre clases

Por lo tanto, puede referenciar elementos por su nombre sin necesidad de IDs.

## 🔧 Implementación Técnica

### Props Requeridas en BoardPage
```tsx
<UmlPrompt
  isOpen={isPromptOpen}
  onClose={() => setIsPromptOpen(false)}
  onCreateNode={handleCreateNodeFromPrompt}
  onCreateEdge={handleCreateEdgeFromPrompt}
  onUpdateNode={handleUpdateNodeFromPrompt}
  onUpdateEdge={handleUpdateEdgeFromPrompt}
  onDeleteNode={removeNodeAndEdges}  // ✨ NUEVO
  onDeleteEdge={deleteEdge}           // ✨ NUEVO
  existingNodes={nodes}
  existingEdges={edges.map(convertReactFlowToUMLEdge)}
/>
```

### Tipos de Acciones Soportadas
```typescript
interface DiagramAction {
  type: 'create' | 'update' | 'delete';
  target: 'class' | 'attribute' | 'edge';
  data: any;
}
```

## 🚀 Ejemplo de Flujo Completo

**Crear diagrama completo por voz:**
1. "Crea clase Usuario con nombre y email tipo String"
2. "Agrega edad tipo Integer a Usuario"
3. "Crea clase Pedido con fecha tipo Date y total tipo Float"
4. "Relación de uno a muchos entre Usuario y Pedido"
5. "Elimina el atributo email de Usuario"
6. "Borra la clase Pedido"

## ⚠️ Notas Importantes
- Las eliminaciones son **inmediatas** y **no se pueden deshacer**
- Al eliminar una clase, también se eliminan automáticamente sus relaciones
- El sistema es sensible al contexto: asegúrate de que los nombres coincidan exactamente con las clases existentes
- El costo por petición a OpenAI es de aproximadamente $0.0001 - $0.001 USD por comando
