# UML Board — Qué hace el sistema y cómo cumple los requisitos de la materia

Materia: Ingeniería de Software I (UAGRM). Este documento describe **lo que funciona hoy** en la aplicación,
organizado según los requisitos que pidió el ingeniero para el **1er parcial** (diseño de datos) y el **2do parcial**
(trabajo colaborativo con IA). Lo que aún no está terminado se marca como pendiente.

Leyenda: ✅ funciona · 🟡 parcial · ⏳ pendiente

> Instalación y puesta en marcha: ver [README-INSTALACION.md](README-INSTALACION.md).

---

## 1. Visión general

**UML Board** es una pizarra web colaborativa para diagramar clases UML. Varias personas pueden abrir la misma
pizarra y verla actualizada en tiempo real. Desde el diagrama se puede:

- dibujar clases, atributos y relaciones a mano o pedirlos a la IA con texto o voz;
- importar un diagrama desde una **foto**;
- exportar e importar el modelo en **JSON** (para Enterprise Architect u otras herramientas);
- generar código: **backend Spring Boot** con PostgreSQL, **app Flutter** con CRUD y **colección de Postman**.

Tecnologías: React 18 + TypeScript + Vite, ReactFlow (diagrama), Zustand (estado), Supabase (base de datos,
tiempo real, Edge Functions) y Gemini (IA, vía una Edge Function que guarda la clave).

---

## 2. Acceso y modos de uso

| Función | Estado | Cómo funciona |
|---|---|---|
| Inicio de sesión con nombre | ✅ | En `/login` se escribe el nombre. La IA lo usa para dirigirse a esa persona. Se guarda solo en la pestaña |
| Modo Anfitrión | ✅ | `/board/host`. Puede bloquear la pizarra y copiar el enlace de invitado |
| Modo Invitado | ✅ | `/board/guest`. Ve la pizarra; si está bloqueada por el anfitrión, no puede modificarla |
| Bloqueo de pizarra | ✅ | El anfitrión la bloquea/desbloquea desde la barra superior |
| Varias pizarras | ✅ | Crear, renombrar y eliminar pizarras desde el selector |
| Presencia (quién está conectado) | ✅ | El chat muestra conectados y "participaron, desconectados" |
| Sincronización en tiempo real | ✅ | Cambios en clases, atributos y relaciones llegan a todos (Supabase `postgres_changes`) |
| Persistencia | ✅ | Los diagramas se guardan en Supabase; al reabrir se recupera el estado |

---

## 3. Requisitos del 1er parcial

### 3.1 Modelado conceptual en UML

| Requisito | Estado | Detalle |
|---|---|---|
| Diagrama de clases UML | ✅ | Clases con nombre y atributos (nombre, tipo, visibilidad `public/private/protected`); relaciones de asociación, herencia, composición, agregación y dependencia; multiplicidades 1 y * |
| Tablas intermedias para muchos a muchos | ✅ | Una clase puede marcarse como **asociativa** y relacionar dos clases (la IA la crea sola ante "muchos a muchos" o "*:*") |
| **Diagrama entidad-relación (ER)** en notación pata de gallo | ⏳ | No hay todavía una vista ER separada. Está planificada como "Vista Clases / ER" |
| **Exportar SQL para PostgreSQL** | ⏳ | Pendiente. Hoy la BD se genera dentro del backend, no como script SQL independiente |

### 3.2 Crear el diagrama

| Forma | Estado | Detalle |
|---|---|---|
| A mano | ✅ | Botón **Crear una nueva clase**; arrastrar, editar atributos y crear relaciones desde el borde de cada clase |
| Desde una foto | ✅ | Botón **Importar diagrama desde imagen**. La IA lee la imagen y dibuja las clases y relaciones |

### 3.3 IA que edita el diagrama

El **Asistente UML con IA** (botón de la barra) recibe texto (o dictado por voz en Chrome/Edge) y devuelve
una lista de acciones que se aplican al diagrama existente:

| Acción | Estado |
|---|---|
| Crear clase | ✅ |
| Modificar clase | ✅ |
| Eliminar clase | ✅ |
| Agregar atributo | ✅ |
| Eliminar atributo | ✅ |
| Crear relación (asociación, herencia, composición, agregación, dependencia) | ✅ |
| Eliminar relación | ✅ |
| **Mover / ordenar clases** | ⏳ Pendiente (paso 2 del plan) |

Notas:
- La IA **edita** el diagrama que ya existe; no es un generador de diagramas a partir de una idea
  (así lo pidió el ingeniero).

### 3.4 Generación de código

Desde la barra del diagrama se generan tres entregables (ZIP descargable):

| Generador | Estado | Qué produce |
|---|---|---|
| **Backend Spring Boot** | ✅ | Proyecto JPA con entidades y relaciones. Dos opciones: H2 embebida, o **PostgreSQL con Docker** (`docker-compose.yml` con PostgreSQL en el puerto **5433** del PC para no chocar con una instalación previa). Incluye la colección Postman |
| **Frontend Flutter** | ✅ | App con CRUD por entidad, cliente HTTP (`package:http`) hacia el backend |
| **Colección Postman** | ✅ | Peticiones de cada entidad para probar el backend |

Pendiente de verificación: probar el backend generado con Postman y la app Flutter en el celular.

### 3.5 Integración con Enterprise Architect

| Función | Estado | Detalle |
|---|---|---|
| Exportar modelo | ✅ | Exporta el diagrama a **JSON** |
| Importar modelo | ✅ | Importa desde **JSON** |
| Importar XML de EA | ⏳ | No implementado. Solo se maneja JSON |

### 3.6 Otros requisitos del 1er parcial

| Requisito | Estado | Detalle |
|---|---|---|
| Asistente o formulario para el usuario final | ✅ | Se dejó como cuadro de prompt (el ingeniero aceptó formulario o asistente) |
| Aplicación que funcione **sin internet** | ⏳ | Pendiente. La colaboración en tiempo real y la IA necesitan red; se mostrará un aviso. El plan es un modo offline (SQLite y cola de sincronización) en la app Flutter generada |
| Front móvil el día del examen | 🟡 | La app Flutter se genera; falta probarla en el celular |
| IA dentro del celular (modelo local) | ⏳ | Opcional y al final del plan |

---

## 4. Requisitos del 2do parcial

El ingeniero pidió que varias personas vean el mismo tablero, que hagan preguntas a la IA, que **todos vean las
preguntas y respuestas**, y que la IA **sepa quién pregunta y lo mencione siempre**.

| Requisito | Estado | Cómo funciona |
|---|---|---|
| Chat compartido en tiempo real | ✅ | Pestaña **Chat del equipo**. Los mensajes se guardan en la tabla `chat_messages` y llegan a todos por tiempo real |
| Preguntas a la IA visibles para todos | ✅ | Las preguntas al chat general quedan en el historial. La respuesta aparece con el autor **"IA Dev Senior"** |
| La IA sabe quién pregunta | ✅ | Cada mensaje se envía a la IA con el nombre de su autor. La IA recibe la lista de participantes y los conectados |
| La IA siempre menciona a quien pregunta | ✅ | Está en las instrucciones del sistema: debe dirigirse a la persona por su nombre |
| La IA conoce el diagrama | ✅ | En cada consulta recibe la descripción actual de clases y relaciones |
| Adjuntar imágenes o PDF a una pregunta | ✅ | Hasta 10 MB. Si es imagen o PDF, la IA lo analiza (por ejemplo, un diagrama fotografiado) |
| Mensajes privados entre personas | ✅ | Además del chat general, cada persona puede escribir en privado a otra. Solo lo ven ellas dos |
| Modelo de IA local (Google Colab u otro) | ⏳ | No implementado. Hoy la IA es **Gemini en la nube** (gratuito), accedido a través de Supabase |

---

## 5. Seguridad y decisiones de diseño

- **La clave de la IA no está en el navegador.** Vive como secreto en Supabase y la Edge Function `openai-proxy`
  la usa para llamar a Gemini. Por eso el repositorio no contiene claves privadas.
- **Clave pública de Supabase (anon):** es pública por diseño; la protección está en las políticas de la base de datos.
- **Origen del código:** la base del proyecto fue tomada de un trabajo previo de compañeros, con créditos en el
  `README.md`. Las extensiones (login, modos, chat compartido, IA, generadores) se desarrollan en este repositorio.

---

## 6. Plan pendiente (orden acordado)

1. ✅ Supabase propio y IA gratuita; prueba de funcionamiento.
2. ⏳ IA que mueve y ordena clases (acción `move`).
3. ⏳ Vista ER en notación pata de gallo + exportar SQL para PostgreSQL.
4. ⏳ Modo offline en la app Flutter generada.
5. ⏳ (Opcional) PWA e IA en el celular.
6. 🟡 2do parcial: chat compartido con IA "dev senior" (hecho) y modelo local en Colab (pendiente).

Cada etapa se prueba antes de pasar a la siguiente: la app Flutter en emulador o celular, y el backend con Postman.
