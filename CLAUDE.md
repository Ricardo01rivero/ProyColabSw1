# Contexto del proyecto (leer primero)

Repo del usuario: https://github.com/Ricardo01rivero/ProyColabSw1.git (rama `main`).
Materia: Ingeniería de Software I (UAGRM). El usuario (Ricardo) cursa la materia y debe presentar
el **1er parcial (pendiente, no lo presentó)** y el **2do parcial (fecha original: miércoles 11 de noviembre)**.

## Origen del código
Base tomada de un proyecto previo de compañeros (Klaus Parada Burgos y Marcos A. Villarroel Siancas,
sem. 3-2025), rama `hide-openai-token` de https://github.com/daviddlv007/proyecto-software-1.
Se subió como repo nuevo, un solo commit, con créditos en el README (decisión acordada con el usuario:
no esconder el origen; se evaluó la opción sin créditos y se descartó). Mantener esos créditos.
La carpeta antigua `../proyecto_Sw1` es solo respaldo (rama `main` del compañero); no se usa.

## Qué es el sistema
SPA React 18 + TypeScript + Vite en `uml-board/`. Pizarra colaborativa de diagramas de clases UML (ReactFlow),
estado con Zustand, persistencia y tiempo real con Supabase (tablas `boards`, `diagrams`; sync por `postgres_changes`).
IA vía OpenAI (gpt-4o): asistente de texto/voz que edita el diagrama (`services/aiPromptService.ts`) e
importación de diagrama desde imagen (`services/diagramImportService.ts`).
Generadores en `src/utils/`: backend Spring Boot (JPA, H2 o PostgreSQL+Docker), frontend Flutter CRUD y colección Postman (ZIP).
Esta rama añade: login/logout, modos Anfitrión/Invitado (`/board/host`, `/board/guest`), bloqueo de pizarra,
proxy serverless para esconder el token de OpenAI (despliegue en Vercel).

## Requisitos del ingeniero – 1er parcial
Software colaborativo, solo diseño de datos. Modelado conceptual en UML: **diagrama de clases y diagrama
entidad-relación**. IA que **edita** el diagrama (mover, agregar, cambiar, eliminar; NO generar uno desde una idea).
Generar backend **Spring Boot** completo listo para el IDE, BD **PostgreSQL**. Crear el diagrama a mano o desde foto.
Integrar con Enterprise Architect / exportar e importar. Front móvil el día del examen. Asistente o formulario
para el usuario final. App preparada para funcionar sin internet; IA en el celular (el modelo).

## Requisitos – 2do parcial
IA como "desarrollador senior más": usuarios de distintas partes ven el mismo tablero, **hacen preguntas a la IA y
todos ven las preguntas/respuestas**; la IA sabe **quién** pregunta y siempre lo menciona (nada genérico).
Modelo **local** valorable, no obligatorio (el PC del usuario es modesto → usar Google Colab u otro recurso).
El ingeniero ofreció 3 vías: ajustar lo que faltó / 100% lo ya desarrollado / empezar de nuevo → elegimos ajustar y ampliar.

## Decisiones tomadas con el usuario
- Enterprise Architect: dejar como está; basta exportar/importar. Nota: el PDF de los compañeros habla de importar XML
  pero el código solo maneja JSON.
- Asistente: se deja como formulario/cuadro de prompt (el ingeniero dijo "o formulario o asistente").
- Offline: priorizar la **app Flutter generada** (SQLite local + cola de sincronización). PWA de la web es opcional.
  Colaboración en tiempo real e IA en la nube no pueden funcionar sin red (mostrar aviso).
- IA dentro del celular: dejarla para el final, solo como extra opcional.
- ER: agregar vista "Clases / ER" en notación pata de gallo sobre el mismo modelo (PK/FK, tablas intermedias
  de muchos a muchos) + exportar SQL para PostgreSQL.

## Plan (orden acordado)
1. Crear Supabase propio (tablas `boards` y `diagrams`; ver carpeta `supabase/`), cambiar URL/clave en
   `uml-board/src/lib/supabase.config.ts` (hoy apunta al Supabase del compañero), configurar clave de IA
   (OpenAI o Gemini) y **probar que todo funciona** antes de modificar nada.
2. IA que mueve/ordena clases (nueva acción `move`).
3. Vista ER + exportar SQL.
4. Modo offline en la app Flutter generada.
5. (Opcional) PWA e IA en el celular.
6. 2do parcial: chat compartido en tiempo real con IA "dev senior" que identifica al usuario; modelo local en Colab.
Probar cada etapa (la app Flutter con emulador/celular; el backend con Postman).

## Estado (actualizado 10/11/2026)
- Paso 1 HECHO: Supabase propio `ffffowrfaulleiqbizxg` (org ProySw1, plan Free). Esquema en `supabase/setup.sql`.
  URL/clave en `uml-board/.env.local` (no se sube; plantilla `.env.example`), leídas en `supabase.config.ts`.
  La app abre siempre la pizarra id '1' (sembrada en setup.sql); el enlace de invitado no incluye el id (pendiente).
- IA: Gemini gratis vía Edge Function `openai-proxy` (convierte formato OpenAI <-> Gemini nativo, reintentos y
  modelos de respaldo). Secretos en Supabase: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.6-flash`.
  `gemini-3.8-flash` se cuelga en capa gratuita. "Verify JWT" debe estar APAGADO (la clave es sb_publishable).
  GET al proxy lista modelos; `?model=` permite probar otro. El usuario despliega pegando el código en el Dashboard.
- Voz: Web Speech API, solo Chrome/Edge (no en el navegador integrado de VS Code).
- Se adelantó el paso 6 (2do parcial) antes de los pasos 2-5.
- Paso 6 HECHO: chat compartido (tabla chat_messages, privados, adjuntos, presencia) + IA "dev senior".
- Backend generado probado (10/11): Docker multi-etapa, FKs reales (@ManyToOne de solo lectura), 409 en FK
  inválida, ddl update, PostgreSQL de Docker en puerto 5433 del PC (el usuario tiene PostgreSQL 18 local en 5432),
  atributos normalizados a camelCase, CORS (WebConfig). Probado desde Antigravity IDE con JDK 17 (Temurin).
- Flutter generado: pantalla "Servidor" para cambiar la IP del backend en la app (shared_preferences),
  AndroidManifest con INTERNET + usesCleartextTraffic. Compila para web. Falta aceptar licencias Android
  (`flutter doctor --android-licenses`, debe hacerlo el usuario) y probar en el Redmi Note 9S por USB.
- Proyectos de prueba en `C:\Users\win10\Desktop\backend-demo\` (spring-crud y flutter\flutter-mvp).
- Flutter en `C:\Programas\Herramientas\flutter`. IP del PC en su wifi: 192.168.1.9 (perfil Público, Java permitido).

## Trabajo en equipo (ramas)
- Compañera colaboradora: Cinthia (GitHub `Capi03`), trabaja en la rama `cinthia` (pasos 2 y 3: mover clases con IA,
  vista ER + SQL, mejoras visuales). Ricardo trabaja en la rama `ricardo` (generadores, Flutter, offline = paso 4).
- **Nunca unir a `main` sin orden explícita de Ricardo**, y él la da solo cuando Cinthia confirme que todo está OK.
- Al unir: conservar el `currentUser.ts` de `ricardo` (nombre por pestaña con sessionStorage); la versión de
  `cinthia` fue reescrita porque el archivo faltaba en el repo (lo excluía la regla `lib/` del .gitignore).

## Notas para Claude
- Responder en español. No asumir pronombres del usuario.
- No hacer commit ni push sin que el usuario lo pida. Trailer de commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `gh` (GitHub CLI) no está instalado en el PC del usuario.
- Nunca subir claves privadas; la clave anon de Supabase es pública por diseño, la de OpenAI no.
