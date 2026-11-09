# 🧪 Script de Pruebas - Cardinalidades del Asistente UML

## Instrucciones
1. Abrir el UML Designer en el navegador
2. Hacer clic en "✨ Asistente UML"
3. Probar cada comando de la lista

---

## ✅ Test 1: Crear Clases Base
**Comando:**
```
Crea clase Usuario con id tipo Integer y nombre tipo String, luego crea clase Pedido con fecha tipo Date
```

**Esperado:**
- Clase "Usuario" con atributos: id (Integer), nombre (String)
- Clase "Pedido" con atributo: fecha (Date)

---

## ✅ Test 2: Relación 1:1 (Uno a Uno)
**Comando:**
```
Crea una relación 1:1 entre Usuario y Perfil
```

**Esperado:**
- Relación de Usuario a Perfil
- Multiplicidad: 1 en origen, 1 en destino
- Tipo: asociación

---

## ✅ Test 3: Relación 1:* (Uno a Muchos)
**Comando:**
```
Usuario tiene muchos Pedidos
```

**Esperado:**
- Relación de Usuario a Pedido
- Multiplicidad: 1 en origen (Usuario), * en destino (Pedidos)
- Tipo: asociación

---

## ✅ Test 4: Relación *:1 (Muchos a Uno)
**Comando:**
```
Crea clase Producto, luego crea clase Categoría, después muchos Productos pertenecen a una Categoría
```

**Esperado:**
- Clases: Producto y Categoría creadas
- Relación de Producto a Categoría
- Multiplicidad: * en origen (Productos), 1 en destino (Categoría)
- Tipo: asociación

---

## ✅ Test 5: Variante con "1 a muchos" explícito
**Comando:**
```
Crea una asociación 1 a muchos entre Categoría y Producto
```

**Esperado:**
- Relación de Categoría a Producto
- Multiplicidad: 1 en origen, * en destino
- Tipo: asociación

---

## ✅ Test 6: Relación *:* (Muchos a Muchos - Tabla Intermedia)
**Comando:**
```
Crea clase Estudiante con nombre tipo String, luego crea clase Curso con codigo tipo String, finalmente relación muchos a muchos entre Estudiante y Curso
```

**Esperado:**
- Clases: Estudiante, Curso creadas
- **Clase intermedia** "Estudiante_Curso" (marcada como asociativa)
- Relación 1: Estudiante(1) → Estudiante_Curso(*)
- Relación 2: Curso(1) → Estudiante_Curso(*)

---

## ✅ Test 7: Composición con "tiene muchos"
**Comando:**
```
Crea clase Factura, luego crea clase DetalleFactura, después Factura contiene muchos DetalleFactura
```

**Esperado:**
- Clases: Factura, DetalleFactura
- Relación de Factura a DetalleFactura
- Tipo: **composición** (rombo lleno)
- Multiplicidad: 1 en origen, * en destino

---

## ✅ Test 8: Relación 1:1 con lenguaje natural
**Comando:**
```
Persona tiene una Dirección
```

**Esperado:**
- Relación de Persona a Dirección
- Multiplicidad: 1:1
- Tipo: asociación

---

## ✅ Test 9: Combinación múltiple
**Comando:**
```
Crea clase Cliente con email tipo String, luego Cliente tiene muchos Pedidos, después Pedido tiene una Factura
```

**Esperado:**
- Clase: Cliente creada
- Relación 1: Cliente(1) → Pedido(*)
- Relación 2: Pedido(1) → Factura(1)

---

## 📊 Checklist de Verificación

Después de cada prueba, verificar:

- [ ] Las clases se crearon correctamente
- [ ] Las relaciones aparecen en el diagrama
- [ ] Las **multiplicidades** son correctas (1 o * en cada extremo)
- [ ] El **tipo de relación** es correcto (asociación, composición, etc.)
- [ ] Los **rombos** aparecen solo en composición/agregación
- [ ] Las **flechas** apuntan en la dirección correcta
- [ ] Para M:N, la **clase intermedia** se creó automáticamente

---

## 🐛 Problemas Comunes

### Si las multiplicidades son incorrectas:
- Verificar que el prompt de OpenAI tenga los ejemplos correctos
- Revisar la consola del navegador para ver el JSON generado

### Si no se crea la tabla intermedia en M:N:
- Verificar que el comando contenga "muchos a muchos", "*:*", o "m:n"
- La tabla debe tener `asociativa: true` y `relaciona: [clase1, clase2]`

### Si el tipo de relación es incorrecto:
- Verificar las palabras clave: "contiene" → composición, "hereda" → herencia

---

## 💡 Comandos de Voz

También puedes probar con el micrófono:

1. Clic en 🎤 en el Asistente UML
2. Di: "Usuario tiene muchos pedidos"
3. Espera la transcripción
4. Verifica que se ejecute correctamente

---

## 📝 Registro de Resultados

| Test | Comando | ✅/❌ | Notas |
|------|---------|-------|-------|
| 1 | Crear clases base | | |
| 2 | Relación 1:1 | | |
| 3 | Relación 1:* | | |
| 4 | Relación *:1 | | |
| 5 | "1 a muchos" explícito | | |
| 6 | Relación *:* (M:N) | | |
| 7 | Composición | | |
| 8 | Lenguaje natural | | |
| 9 | Combinación múltiple | | |

---

## 🎯 Resultado Esperado Final

Si todas las pruebas pasan:
- ✅ El asistente reconoce **todas las cardinalidades**
- ✅ El lenguaje natural funciona correctamente
- ✅ Las tablas intermedias se crean automáticamente para M:N
- ✅ Los tipos de relaciones se interpretan correctamente
