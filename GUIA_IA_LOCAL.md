# Guía: IA local (modelo abierto en Google Colab)

La pizarra puede usar dos motores de IA, y se cambia desde la propia app:

| Motor | Qué es | Cuándo usarlo |
|---|---|---|
| **Nube · Gemini** | Gemini a través de la Edge Function `openai-proxy` de Supabase | Es el más preciso, sobre todo con fotos. Necesita internet. |
| **Local · Ollama** | Un modelo abierto (Qwen2.5-VL 7B) que corre en una GPU de Google Colab | Cuando se pide un modelo propio, sin claves ni datos enviados a terceros. |

La IA local afecta a **las tres funciones de IA**: el Asistente UML, la importación de diagrama desde imagen
y el chat "IA Dev Senior".

## Cómo se conecta

```
 Navegador (pizarra)  ──HTTPS──►  túnel Cloudflare  ──►  Ollama (Colab, GPU T4)  ──►  Qwen2.5-VL 7B
 aiClient.ts                      xxxx.trycloudflare.com    puerto 11434
```

- `uml-board/src/lib/aiClient.ts` convierte la petición al formato de Ollama (`/api/chat`) y devuelve la respuesta
  en el mismo formato que la nube, así el resto de la app no cambia según el motor.
- Las imágenes se reducen a 1280 px antes de enviarlas (menos carga para un modelo de 7B).
- El cuaderno `colab/IA_local_Ollama.ipynb` instala Ollama, descarga el modelo y abre el túnel.

---

## 1. Montar el modelo en Colab

1. Abre [Google Colab](https://colab.research.google.com) con tu cuenta de Google.
2. **Archivo → Abrir cuaderno → GitHub** y escribe `Ricardo01rivero/ProyColabSw1` (rama `cinthia` o `main`);
   elige `colab/IA_local_Ollama.ipynb`. (También sirve **Subir** el archivo si lo descargaste.)
3. **Entorno de ejecución → Cambiar tipo de entorno de ejecución → GPU T4 → Guardar.**
4. **Entorno de ejecución → Ejecutar todas** (o celda por celda, en orden).
   - La primera vez, el paso 4 descarga ~6 GB: tarda unos minutos.
   - El paso 6 imprime un recuadro con la URL: `https://algo-algo.trycloudflare.com`.
5. Copia esa URL. **Deja la última celda corriendo** mientras uses la pizarra.

> La URL cambia cada vez que se ejecuta el cuaderno, y Colab cierra la sesión tras un rato de inactividad
> (y a las pocas horas como máximo en la cuenta gratuita). Para el día del examen, déjalo encendido antes de empezar.

## 2. Conectar la pizarra

1. Abre la pizarra, entra al **💬 Chat IA** y pulsa el **⚙️** del encabezado.
2. Elige **Local · modelo abierto (Ollama)**.
3. Pega la URL del túnel y deja el modelo `qwen2.5vl:7b`.
4. Pulsa **Probar conexión**. Debe decir `✅ Conectado: qwen2.5vl:7b disponible`.
5. **Guardar.** En el encabezado del chat aparece `Local · qwen2.5vl:7b`.

La elección se guarda en ese navegador. Para volver a Gemini: ⚙️ → **Nube · Gemini** → Guardar.

## 3. Pruebas

Con el motor en **Local**, prueba cada función. La primera respuesta tarda más (el modelo se está calentando).

| Función | Prueba | Resultado esperado |
|---|---|---|
| Asistente UML | "Crea clase Cliente con nombre tipo String y nit tipo String" | La clase aparece con sus atributos |
| Asistente UML | "Mueve la clase Cliente a la derecha de Factura" | La clase cambia de posición |
| Asistente UML | "Ordena todas las clases en cuadrícula" | Todo se reacomoda sin encimarse |
| Importar imagen | Foto o captura de un diagrama de clases | Se crean las clases y relaciones |
| Chat IA Dev Senior | "¿Qué relación conviene entre Factura y Producto?" | Responde mencionando por nombre a quien preguntó |

Para comparar con la nube, repite la misma prueba con **Nube · Gemini** y anota diferencias de calidad y de tiempo.

> Un modelo de 7B es **menos preciso** que Gemini, sobre todo al leer fotos y al seguir instrucciones largas.
> Si falla una instrucción, repítela más corta o en dos pasos. La app tolera respuestas con texto alrededor del JSON
> o con comas sobrantes (`parseActionsJson`), pero no puede adivinar una acción que el modelo no generó.

## 4. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "No se pudo conectar con la IA local" | Colab se cerró o la URL cambió | Vuelve a ejecutar el cuaderno, copia la nueva URL y pulsa Probar conexión |
| "La IA local tardó demasiado" | Modelo sin calentar o GPU ocupada | Reintenta; el límite es de 3 minutos por respuesta |
| "Conecta, pero no tiene el modelo…" | El modelo escrito no coincide | Usa el nombre exacto que muestra el mensaje (`qwen2.5vl:7b`) |
| El cuaderno dice "No hay GPU" | Entorno sin GPU | Cambia el tipo de entorno a **T4 GPU** y empieza otra vez |
| Falta memoria al cargar el modelo | GPU con poca memoria | En el cuaderno, cambia `MODELO` a `qwen2.5vl:3b` y úsalo también en la pizarra |
| Error de CORS en la consola del navegador | Servidor iniciado sin `OLLAMA_ORIGINS` | Ejecuta el paso 3 del cuaderno tal como está (ya lo incluye) |
| Colab pide verificación o límite de GPU | Cuota gratuita agotada | Espera unas horas o usa otra cuenta de Google |

---

## 5. Texto para la documentación (sección "IA local")

> **IA local.** Además de Gemini (nube), el sistema puede usar un modelo de lenguaje abierto ejecutado en un
> servidor propio. Se usó **Qwen2.5-VL 7B** (un modelo multimodal que entiende texto e imágenes) servido con
> **Ollama** en una GPU NVIDIA T4 de **Google Colab**, expuesta mediante un túnel HTTPS de **Cloudflare**. Se
> eligió Colab porque los equipos de desarrollo no tienen memoria de video suficiente para un modelo de 7B
> parámetros. El cliente (`aiClient.ts`) traduce las peticiones al formato nativo de Ollama y devuelve respuestas
> con el mismo formato que la nube, de modo que el asistente UML, la importación de diagramas desde imagen y el
> chat compartido funcionan igual con cualquiera de los dos motores. El usuario elige el motor desde el chat
> (Nube/Local) y la elección se guarda en el navegador. **Ventajas:** no requiere claves de pago, los datos no
> salen a servicios de terceros y el modelo es reemplazable. **Limitaciones:** menor precisión que Gemini al leer
> fotos, la URL del túnel cambia en cada sesión y Colab gratuito cierra las sesiones inactivas.

## 6. Alternativa: Ollama en tu propio PC

Si algún equipo tiene GPU con 8 GB de memoria de video o más, no hace falta Colab:

```bash
ollama pull qwen2.5vl:7b
```

Inicia el servidor permitiendo la página web (en PowerShell):

```bash
$env:OLLAMA_ORIGINS="*"; ollama serve
```

En la pizarra usa la URL `http://localhost:11434`. Solo funciona si la pizarra se abre en ese mismo PC.
