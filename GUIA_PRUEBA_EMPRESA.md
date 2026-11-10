# Guía: probar cardinalidades y armar el modelo de datos de una empresa

Esta guía sirve para dos cosas:

1. **Probar que las cardinalidades funcionan** de punta a punta (diagrama de clases → vista ER → SQL → backend Spring Boot).
2. **Qué hacer cuando te dan el problema de una empresa** y hay que dejar armado el modelo de datos completo.

> **Importante (requisito del ingeniero):** la IA del sistema **edita** el diagrama siguiendo instrucciones
> (agregar, cambiar, eliminar, mover). No inventa un diagrama a partir de una idea suelta. Por eso el método
> de abajo convierte el problema de la empresa en **instrucciones explícitas** que tú le das al Asistente UML.

---

## 1. Cómo se traduce cada cardinalidad

En el diagrama, `origen` es la clase desde donde sale la relación y `destino` es a la que llega.
La **clave foránea (FK)** queda siempre en el lado "muchos".

| Lo que dices al Asistente | Multiplicidad | Dónde queda la FK | En la vista ER |
|---|---|---|---|
| "Categoria tiene muchos Productos" | `1` → `*` | `producto.categoria_id` | pata de gallo en Producto |
| "Muchos Productos pertenecen a una Categoria" | `*` → `1` | `producto.categoria_id` | pata de gallo en Producto |
| "Relación 1:1 entre Empleado y Credencial" | `1` → `1` | `credencial.empleado_id` (única) | dos barras en ambos lados |
| "Relación muchos a muchos entre Factura y Producto" | `*` ↔ `*` | tabla intermedia con 2 FK | tabla verde en el centro |
| "Empleado hereda de Persona" | herencia | `empleado.persona_id` (única) | uno a uno |
| "Pedido usa Cliente" (dependencia) | uso | no genera columnas | línea punteada en el diagrama |

Reglas que conviene recordar:

- `1:*` y `*:1` dan el **mismo resultado en la base de datos** (la FK va en el lado "muchos"); cambia solo el sentido en que lo dices.
- Una relación **muchos a muchos** siempre crea una **clase asociativa** (tabla intermedia). Ahí van los datos propios de la relación (cantidad, fecha, precio…).
- La PK de toda tabla es `id`; las FK se llaman `<tabla>_id`; `String` se exporta como `VARCHAR(255)`.

---

## 2. Método: del problema de la empresa al diagrama

Cuando te den el contexto de una empresa, sigue estos pasos **en este orden**:

1. **Subraya los sustantivos importantes** del enunciado: serán las clases (Cliente, Producto, Factura…).
2. **Anota los datos de cada uno** (nombre, precio, fecha…): serán los atributos, con tipo `String`, `Integer`, `Float`, `Boolean` o `Date`.
3. **Subraya los verbos entre sustantivos** ("un cliente *compra*…", "cada factura *incluye* varios productos"): serán las relaciones.
4. **Para cada relación pregunta en los dos sentidos:**
   - ¿Un A puede tener varios B? ¿Un B puede tener varios A?
   - Un lado "muchos" y otro "uno" → `1:*`.
   - Muchos en ambos lados → muchos a muchos (clase asociativa).
   - Uno en ambos → `1:1`.
5. **Revisa si algo "es un tipo de" otra cosa** ("el empleado es una persona") → herencia.
6. **Dale las instrucciones al Asistente UML en bloques pequeños** (primero las clases, luego las relaciones). Bloques cortos funcionan mejor que un solo texto larguísimo.
7. **Revisa el resultado** con el botón **Ver ER** y corrige lo que falte con instrucciones puntuales.

---

## 3. Ejemplo completo: distribuidora de bebidas

### Enunciado de la empresa

> Una distribuidora compra bebidas a **proveedores** y las ordena en **categorías**. Cada **producto** tiene
> código, nombre, precio y stock; pertenece a una categoría y lo suministra un proveedor.
> Los **clientes** (nombre, NIT, dirección) reciben **facturas** (número, fecha, total) atendidas por un
> **empleado**. Una factura incluye varios productos y un producto aparece en varias facturas; de cada
> línea se guarda la cantidad y el precio unitario. Un empleado es una **persona** (nombre, CI), tiene cargo y
> sueldo, y una única **credencial** de acceso (usuario, activo).

### Paso a paso con el Asistente UML

Abre **✨ Asistente UML**, pega cada bloque, envía y espera a que se cierre antes del siguiente.

**Bloque 1 – clases (dos envíos)**

```
Crea clase Categoria con nombre tipo String y descripcion tipo String, luego crea clase Proveedor con nombre tipo String y telefono tipo String, luego crea clase Producto con codigo tipo String, nombre tipo String, precio tipo Float y stock tipo Integer
```

```
Crea clase Cliente con nombre tipo String, nit tipo String y direccion tipo String, luego crea clase Factura con numero tipo String, fecha tipo Date y total tipo Float, luego crea clase Persona con nombre tipo String y ci tipo String
```

```
Crea clase Empleado con cargo tipo String y sueldo tipo Float, luego crea clase Credencial con usuario tipo String y activo tipo Boolean
```

**Bloque 2 – relaciones uno a muchos y muchos a uno**

```
Categoria tiene muchos Productos
```

```
Proveedor tiene muchos Productos
```

```
Cliente tiene muchas Facturas
```

```
Muchas Facturas son atendidas por un Empleado
```

**Bloque 3 – herencia y uno a uno**

```
Empleado hereda de Persona
```

```
Crea una relación 1:1 entre Empleado y Credencial
```

**Bloque 4 – muchos a muchos con datos propios**

```
Relación muchos a muchos entre Factura y Producto
```

La IA crea la clase asociativa `Factura_Producto`. Ponle el nombre definitivo y sus datos:

```
Cambia el nombre de Factura_Producto a DetalleFactura
```

```
Agrega cantidad tipo Integer a la clase DetalleFactura
```

```
Agrega precioUnitario tipo Float a la clase DetalleFactura
```

**Bloque 5 – ordenar el diagrama**

```
Ordena todas las clases en cuadrícula
```

(también puedes pedir "acomoda el diagrama según la herencia" o "ordena en círculo").

> Estos textos siguen el vocabulario que reconoce el asistente (ver `ASISTENTE_UML_GUIA.md`). Si el
> modelo de IA interpreta algo distinto, corrige con una instrucción puntual; no hace falta empezar de cero.

### Resultado esperado

Clases: `Categoria`, `Proveedor`, `Producto`, `Cliente`, `Factura`, `Persona`, `Empleado`, `Credencial` y
la asociativa `DetalleFactura` (9 en total). En la vista **Ver ER** deben aparecer estas claves foráneas
(es lo que genera el sistema para este diagrama):

| Tabla | Columna FK | Apunta a | Tipo de relación |
|---|---|---|---|
| `producto` | `categoria_id` | `categoria.id` | 1:* |
| `producto` | `proveedor_id` | `proveedor.id` | 1:* |
| `factura` | `cliente_id` | `cliente.id` | 1:* |
| `factura` | `empleado_id` | `empleado.id` | *:1 (la FK va en `factura`, que es el lado "muchos") |
| `empleado` | `persona_id` (única) | `persona.id` | herencia |
| `credencial` | `empleado_id` (única) | `empleado.id` | 1:1 |
| `detalle_factura` | `factura_id` | `factura.id` | tabla intermedia (verde) |
| `detalle_factura` | `producto_id` | `producto.id` | tabla intermedia (verde) |

---

## 4. Checklist de verificación

Marca cada punto con el diagrama del ejemplo.

### 4.1 Diagrama y vista ER
- [ ] Están las 9 clases con sus atributos.
- [ ] En **Ver ER** cada relación tiene pata de gallo en el lado "muchos" y dos barras en el lado "uno".
- [ ] Al pasar el cursor sobre cada línea aparece la explicación de la relación y su FK (coincide con la tabla de arriba).
- [ ] `DetalleFactura` sale en verde (tabla intermedia).

### 4.2 SQL (PostgreSQL)
- [ ] Botón **🧾 SQL** descarga un `.sql`.
- [ ] Ejecútalo en una base vacía:

```bash
createdb -U postgres prueba
```
```bash
psql -U postgres -d prueba -f distribuidora.sql
```

- [ ] Comprueba las claves foráneas creadas:

```sql
SELECT conrelid::regclass AS tabla, conname AS restriccion, confrelid::regclass AS referencia
FROM pg_constraint WHERE contype = 'f' ORDER BY 1;
```

Deben salir las 8 filas de la tabla de arriba.

### 4.3 Backend Spring Boot
- [ ] Botón **⚙️ Backend** → opción PostgreSQL + Docker → se descarga el ZIP.
- [ ] Descomprime y levanta la base y la aplicación:

```bash
cd spring-crud
```
```bash
docker compose up -d postgres
```
```bash
mvn spring-boot:run
```

- [ ] Las tablas que crea Spring tienen los **mismos nombres** que el SQL exportado (`detalle_factura`, `categoria_id`, …).
- [ ] Prueba con Postman (colección `DemoAPI.postman_collection.json` incluida en el ZIP):
  1. `POST /categorias` → `{"nombre":"Gaseosas"}`.
  2. `POST /productos` con `"categoriaId": 1` → debe crearse.
  3. `POST /productos` con `"categoriaId": 999` → debe **fallar** (la FK existe de verdad).
  4. `DELETE /categorias/1` → borra también sus productos (cascada).

### 4.4 Mover y ordenar con la IA (paso 2)
- [ ] "Mueve la clase Cliente a la derecha de Factura" cambia la posición de esa clase.
- [ ] "Sube Factura 100 píxeles" la desplaza hacia arriba.
- [ ] "Ordena todas las clases en cuadrícula" reacomoda todo sin encimar clases.

---

## 5. Si algo no sale como se espera

| Problema | Qué hacer |
|---|---|
| La IA entiende la relación al revés | Elimina la relación ("Elimina la relación entre A y B") y vuelve a decirla con la frase exacta de la tabla de la sección 1. |
| Falta un atributo | "Agrega edad tipo Integer a la clase Cliente". |
| Una clase quedó con otro nombre | "Cambia el nombre de X a Y". |
| El asistente se equivoca con textos muy largos | Divide el envío en bloques más cortos (las respuestas de la IA tienen un límite de tamaño). |
| Error de la IA ("No se pudo procesar tu solicitud") | Reintenta; el proxy ya prueba otros modelos de respaldo. Si persiste, revisa que la clave de Gemini esté en los secretos de Supabase. |
| Quieres rehacer todo | **Limpiar Pizarra** y repite los bloques. |

> **Nota:** el SQL y el backend se generan a partir del mismo modelo, así que si la vista ER está bien,
> lo que sale en la base de datos también lo estará.
