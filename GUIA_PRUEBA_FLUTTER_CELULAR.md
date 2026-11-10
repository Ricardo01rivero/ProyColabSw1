# Guía: probar la app Flutter en el celular (con modo offline)

Esta guía lleva el diagrama desde la web hasta la app corriendo en tu celular, y luego prueba que
**funciona sin internet** y que **sincroniza al volver la conexión**.

> Importante: vuelve a generar **el backend y el frontend** con esta versión del sistema. Cambiaron
> (1) la regla de claves foráneas, (2) los nombres de tablas del backend y (3) la app Flutter ahora incluye
> el modo offline. Un ZIP generado antes no sirve para esta prueba.

---

## 0. Qué necesitas

| Herramienta | Para qué | Cómo comprobarlo |
|---|---|---|
| Java 17 y Maven (o un IDE como IntelliJ / Eclipse) | Correr el backend | `java -version` y `mvn -version` |
| Flutter SDK | Compilar la app | `flutter doctor` (debe mostrar Android toolchain sin errores) |
| Celular Android con **depuración USB** activada | Probar la app | `flutter devices` debe listarlo |
| PC y celular en la **misma red Wi-Fi** | Que el celular llegue al backend | — |

---

## 1. Generar los proyectos desde la web

Con tu diagrama abierto (puedes usar el de `GUIA_PRUEBA_EMPRESA.md`):

1. **⚙️ Backend** → elige **H2 embebido** (la forma más simple, sin Docker) → se descarga el ZIP.
2. **📱 Frontend** → se descarga `flutter-mvp.zip`.
3. Descomprime los dos ZIP en una carpeta de trabajo.

---

## 2. Levantar el backend en tu PC

Desde la carpeta `spring-crud`:

```bash
mvn spring-boot:run
```

(o abre la carpeta en el IDE y ejecuta `DemoApplication`).

Comprueba que responde en tu PC: abre `http://localhost:8080/categorias` (usa el nombre de una de tus
clases en plural y minúscula). Debe devolver `[]`.

### Averigua la IP de tu PC

En Windows (PowerShell):

```powershell
ipconfig
```

Busca **Dirección IPv4** del adaptador Wi-Fi, por ejemplo `192.168.0.15`.

### Comprueba que el celular llega al backend

Abre el navegador **del celular** (conectado al mismo Wi-Fi) y entra a `http://TU_IP:8080/categorias`.
Si carga `[]`, todo está bien. Si no carga:

- Windows pide permiso de firewall la primera vez que corre Java: acepta para **redes privadas**.
  Si lo rechazaste: *Firewall de Windows → Permitir una aplicación* → marca Java en red privada,
  o crea una regla de entrada para el puerto 8080.
- Verifica que ambos estén en la misma red (no uses datos móviles en el celular).
- Algunas redes de universidad aíslan los dispositivos entre sí. En ese caso usa el **punto de acceso
  (hotspot) del celular** y conecta la PC a él.

---

## 3. Preparar y correr la app Flutter

Desde la carpeta `flutter-mvp`:

```bash
flutter create --platforms=android .
```

Crea la parte de Android (el ZIP solo trae el código Dart).

### 3.1 Poner la IP del backend

Edita `lib/config/api_config.dart` y deja una sola línea de `baseUrl` activa:

```dart
static const String baseUrl = 'http://192.168.0.15:8080';   // <- la IP de tu PC
```

### 3.2 Permitir HTTP (sin https) en Android

Android bloquea por defecto las conexiones `http://`. Abre `android/app/src/main/AndroidManifest.xml`
y agrega `android:usesCleartextTraffic="true"` a la etiqueta `<application`:

```xml
<application
    android:label="flutter_mvp"
    android:usesCleartextTraffic="true"
    ...>
```

Y, justo antes de `<application`, el permiso de internet:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
```

### 3.3 Instalar dependencias y correr

```bash
flutter pub get
```
```bash
flutter devices
```
```bash
flutter run
```

La primera compilación tarda unos minutos. La app abre con "Bienvenido al Sistema CRUD" y el menú lateral
con tus entidades.

> En un **emulador** de Android el PC se llama `10.0.2.2` (usa `http://10.0.2.2:8080`).

---

## 4. Pruebas con conexión

1. Menú lateral → una entidad "padre" (p. ej. **Categoria**) → botón **+** → crea 2 registros.
2. Crea un registro de una entidad hija (p. ej. **Producto**) y elige la categoría en la lista desplegable.
3. En tu PC abre `http://localhost:8080/productos`: debe aparecer lo que creaste en el celular.
4. Edita y borra un registro; verifica en el navegador de la PC que cambió.

✅ Si esto funciona, la app y el backend están bien conectados.

---

## 5. Pruebas del modo offline

El modo offline guarda todo lo que lees en una base SQLite del teléfono y deja una **cola de cambios**
que se envía sola cuando vuelve la conexión (se revisa cada 15 segundos). Abajo, cada prueba con su
resultado esperado.

### Prueba A – Leer sin conexión

1. Abre las listas de **todas** las entidades al menos una vez (así se guardan en el teléfono).
2. Apaga el Wi-Fi del celular (o activa el modo avión).
3. Abre de nuevo las listas.

**Esperado:** los datos siguen apareciendo, y abajo sale una barra naranja
**"Sin conexión · mostrando los datos guardados en el teléfono"**.

### Prueba B – Crear, editar y borrar sin conexión

Con el Wi-Fi apagado:

1. Crea una categoría nueva ("Snacks").
2. Edita otra categoría existente.
3. Borra una tercera.

**Esperado:** los cambios se ven al instante en la lista, y la barra dice
**"Sin conexión · N cambio(s) se enviarán al volver la red"** (N = cantidad de cambios).
La categoría nueva puede ocupar el final de la lista.

### Prueba C – Sincronizar al volver la conexión

1. Enciende el Wi-Fi.
2. Espera hasta 15 segundos (o toca la barra para forzar).

**Esperado:** la barra pasa a azul **"Sincronizando…"** y luego desaparece.
En la PC, abre `http://localhost:8080/categorias`: debe estar "Snacks", el cambio de la editada y sin la borrada.

### Prueba D – Claves foráneas creadas sin conexión

Con el Wi-Fi apagado:

1. Crea una **categoría** nueva ("Lácteos").
2. Crea un **producto** que use esa categoría recién creada.
3. Enciende el Wi-Fi y espera la sincronización.

**Esperado:** en la PC, `http://localhost:8080/productos` muestra el producto con el `categoriaId`
**real** de "Lácteos" (el sistema reemplaza el id temporal por el id que le dio el servidor).

### Prueba E – Los datos sobreviven al cierre de la app

1. Sin conexión, crea un registro.
2. Cierra la app por completo (deslízala fuera de recientes) y ábrela otra vez, aún sin conexión.

**Esperado:** el registro sigue ahí y el contador de cambios pendientes se mantiene.

### Prueba F – Un cambio que el servidor rechaza

1. Sin conexión, crea un producto con una categoría y, antes de sincronizar, borra esa categoría **desde la PC**
   (Postman/navegador).
2. Enciende el Wi-Fi.

**Esperado:** tras unos intentos, aparece una barra roja explicando que el servidor rechazó el cambio
y se descartó; el resto de cambios se sincroniza con normalidad.

---

## 6. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La app siempre dice "Sin conexión" | Mala IP, firewall, redes distintas o falta `usesCleartextTraffic` | Repite la sección 2 (prueba desde el navegador del celular) y revisa el paso 3.2 |
| `Cleartext HTTP traffic not permitted` en el log | Falta el cambio del AndroidManifest | Paso 3.2 |
| La lista queda vacía aunque hay datos | Nunca se abrió esa lista con conexión | Ábrela con el Wi-Fi encendido una vez |
| `flutter devices` no ve el celular | Depuración USB apagada o cable solo de carga | Activa opciones de desarrollador → Depuración USB; acepta el aviso en el teléfono |
| Error de Gradle/SDK al compilar | Falta Android SDK o licencias | `flutter doctor --android-licenses` y revisa `flutter doctor` |
| El backend no arranca por Java | Versión de Java incorrecta | El proyecto usa **Java 17** |

---

## 7. Qué NO funciona sin conexión (es normal)

- La **colaboración en tiempo real** del tablero web y el **chat con la IA** necesitan internet: son parte
  de la aplicación web, no de esta app móvil.
- Pantallas que necesiten datos que **nunca** se abrieron con conexión no tendrán nada que mostrar.
- El borrado en cascada se refleja en el teléfono hasta la siguiente sincronización
  (si borras una categoría sin conexión, sus productos aparecen borrados al volver la red).
- El modo offline usa SQLite, así que funciona en **Android e iOS** (no en la versión web de Flutter).
