# UML Board — Guía de instalación

Esta guía explica cómo dejar la aplicación funcionando desde cero: en tu PC, con tu propio proyecto de Supabase
y con IA gratuita (Google Gemini). Sigue los pasos en orden.

> Qué hace la aplicación y qué está terminado: ver [README-FUNCIONAMIENTO.md](README-FUNCIONAMIENTO.md).

---

## 1. Requisitos

| Qué | Para qué |
|---|---|
| **Node.js 18 o superior** y npm | Ejecutar la aplicación web |
| **Git** | Descargar el repositorio |
| **Google Chrome o Microsoft Edge** | El dictado por voz del asistente solo funciona ahí (no en el navegador integrado de VS Code) |
| Cuenta gratuita en **Supabase** (https://supabase.com) | Base de datos, tiempo real y chat compartido |
| Cuenta gratuita en **Google AI Studio** (https://aistudio.google.com) | Clave de API de Gemini para la IA |

---

## 2. Descargar el proyecto

```bash
git clone https://github.com/Ricardo01rivero/ProyColabSw1.git
cd ProyColabSw1

```

---

## 3. Instalar las dependencias

```bash
cd uml-board
npm install
```

---
npm run dev
----
## 4. Crear tu proyecto de Supabase

1. En https://supabase.com crea un proyecto nuevo (plan Free).
2. Abre **SQL Editor → New query**, pega **todo** el contenido de `supabase/setup.sql` y pulsa **Run**.
   - Ese archivo ya incluye el chat (`chat.sql` y `chat_v2.sql`), así que no hace falta ejecutar esos dos.
   - Crea las tablas `boards`, `diagrams`, `chat_messages`, activa el tiempo real y deja sembrada la pizarra con
     `id = '1'`.
3. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key** (es pública por diseño; la clave secreta de OpenAI/Gemini **nunca** va en el front).

---

## 5. Configurar las variables de entorno

Dentro de `uml-board/` crea el archivo **`.env.local`** (copia de `.env.example`):

```bash
cp .env.example .env.local
```

Edita `uml-board/.env.local` con tus datos:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON
```

`.env.local` no se sube a GitHub (está en `.gitignore`).

---

## 6. Desplegar la función que llama a la IA (`openai-proxy`)

La aplicación no habla directo con la IA: habla con una **Edge Function** de Supabase que guarda la clave
y traduce el formato a Gemini. Así la clave nunca queda en el navegador.

1. Obtén una clave gratuita en https://aistudio.google.com (**Get API key**).
2. En Supabase ve a **Edge Functions → Create a new function**, nómbrala **`openai-proxy`**.
3. Pega el contenido de `supabase/functions/openai-proxy/index.ts` y **Deploy**.
4. En esa función **apaga "Verify JWT"** (la app usa la clave pública `anon`).
5. Guarda los secretos en **Edge Functions → Secrets** (no en el código):

   | Nombre | Valor |
   |---|---|
   | `GEMINI_API_KEY` | tu clave de Google AI Studio |
   | `GEMINI_MODEL` | `gemini-3.6-flash` (recomendado) |

   > No uses `gemini-3.8-flash` con la capa gratuita: se queda colgado.

Para probar qué modelos responden, abre en el navegador
`https://TU-PROYECTO.supabase.co/functions/v1/openai-proxy` (GET). Con `?model=nombre` pruebas otro modelo.

---

## 7. Ejecutar la aplicación

```bash
cd uml-board
npm run dev
```

Abre la dirección que muestra la consola (normalmente `http://localhost:5173`).

Rutas principales:

| Ruta | Qué es |
|---|---|
| `/login` | Pide tu nombre (la IA lo usa en el chat). Es la página de inicio |
| `/board/host` | Modo **Anfitrión**: puedes editar, bloquear la pizarra y compartir el enlace de invitado |
| `/board/guest` | Modo **Invitado**: ve y edita la pizarra, respetando el bloqueo |
| `/debug` | Herramienta de pruebas para subir imágenes (no forma parte del flujo normal) |

Para dos personas en la misma pizarra: cada una abre la app en su navegador (o en una ventana de incógnito),
entra con su nombre y ambas ven los cambios en tiempo real.

---

## 8. Compilar para producción

```bash
cd uml-board
npm run build      # genera uml-board/dist
npm run preview    # prueba la versión compilada en local
```

Calidad de código (opcional):

```bash
npm run quality    # lint + formato + tipos
```

---

## 9. Publicar en Vercel (opcional)

`uml-board/vercel.json` ya está configurado (build con Vite, salida `dist`, reescritura a `index.html`).

1. En Vercel importa el repositorio y **Root Directory = `uml-board`**.
2. En **Settings → Environment Variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Despliega. Las rutas `/board/host` y `/board/guest` funcionan al recargar gracias a `vercel.json`.

---

## 10. Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| Pantalla en blanco o "Failed to fetch" | Revisa `.env.local` (URL y clave) y reinicia `npm run dev` después de cambiarlo |
| La IA no responde o da error 401/403 | Revisa que `openai-proxy` esté desplegada con **Verify JWT apagado** y que `GEMINI_API_KEY` esté en Secrets |
| La IA tarda mucho o no responde nunca | Cambia `GEMINI_MODEL` a `gemini-3.6-flash` |
| No se actualiza en tiempo real | Confirma que `setup.sql` se ejecutó completo (activa `supabase_realtime`) |
| El dictado por voz no funciona | Usa Chrome o Edge, fuera del navegador de VS Code |
| `Cannot find module '../lib/currentUser'` | El archivo `uml-board/src/lib/currentUser.ts` debe existir. Si falta, vuelve a copiarlo desde el repositorio |
| Se ve la pizarra vacía | Verifica que exista la fila `boards` con `id = '1'` (la crea `setup.sql`) |
