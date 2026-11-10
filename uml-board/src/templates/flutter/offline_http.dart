import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as real;

import '../config/api_config.dart';
import 'offline_store.dart';
import 'sync_service.dart';

export 'package:http/http.dart' show Response;

/// Reemplazo de `package:http` para toda la app (se importa como `http`).
///
/// Con conexión: hace la petición normal y guarda en el teléfono (SQLite) una copia de lo que lee.
/// Sin conexión: lee desde esa copia y los cambios (crear, editar, borrar) se guardan localmente
/// y se envían solos al servidor cuando vuelve la red. Las pantallas no necesitan saber nada de esto.

const Duration _networkTimeout = Duration(seconds: 8);

class _Target {
  final String entity;
  final int? id;
  _Target(this.entity, this.id);
}

/// Solo se interceptan las rutas del CRUD: /entidad y /entidad/{id}. Lo demás pasa directo.
_Target? _parse(Uri url) {
  final base = Uri.parse(ApiConfig.baseUrl);
  if (url.host != base.host || url.port != base.port) return null;
  final segments = url.pathSegments.where((s) => s.isNotEmpty).toList();
  if (segments.isEmpty || segments.length > 2) return null;
  if (segments[0] == 'actuator' || segments[0] == 'swagger-ui') return null;
  if (segments.length == 1) return _Target(segments[0], null);
  final id = int.tryParse(segments[1]);
  if (id == null) return null;
  return _Target(segments[0], id);
}

real.Response _json(int status, Object? body) => real.Response(
      jsonEncode(body),
      status,
      headers: const {'content-type': 'application/json; charset=utf-8'},
    );

Map<String, dynamic> _decodeBody(Object? body) {
  if (body is String && body.isNotEmpty) {
    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) return decoded;
  }
  return <String, dynamic>{};
}

Map<String, dynamic>? _tryDecodeMap(String body) {
  try {
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic> ? decoded : null;
  } catch (_) {
    return null;
  }
}

/// Si hay cambios pendientes, se envían antes de leer o escribir para no desordenar la secuencia.
Future<void> _flushIfPending() async {
  if (OfflineStore.instance.pendingCount.value > 0) {
    await SyncService.instance.syncNow();
  }
}

Future<real.Response?> _network(Future<real.Response> Function() call) async {
  final sync = SyncService.instance;
  try {
    final response = await call().timeout(_networkTimeout);
    sync.markOnline(true);
    return response;
  } catch (_) {
    sync.markOnline(false);
    return null;
  }
}

Future<real.Response> get(Uri url, {Map<String, String>? headers}) async {
  final target = _parse(url);
  if (target == null) return real.get(url, headers: headers);

  final store = OfflineStore.instance;
  final sync = SyncService.instance;

  if (await sync.ensureOnline()) {
    await _flushIfPending();
    var requestUrl = url;
    if (target.id != null) {
      final id = await store.resolveId(target.id!);
      requestUrl = Uri.parse(ApiConfig.endpoint('${target.entity}/$id'));
    }
    final response = await _network(() => real.get(requestUrl, headers: headers));
    if (response != null) {
      if (response.statusCode == 200) {
        if (target.id == null) {
          final decoded = jsonDecode(response.body);
          if (decoded is List) {
            await store.replaceAll(target.entity, decoded.cast<Map<String, dynamic>>());
            // Incluye lo creado sin conexión que todavía no se pudo enviar
            return _json(200, await store.getAll(target.entity));
          }
        } else {
          final item = _tryDecodeMap(response.body);
          if (item != null) await store.upsert(target.entity, item);
        }
      }
      return response;
    }
  }

  // Sin conexión: se responde desde la copia local
  if (target.id == null) {
    return _json(200, await store.getAll(target.entity));
  }
  final id = await store.resolveId(target.id!);
  final item = await store.getOne(target.entity, id);
  return item != null ? _json(200, item) : _json(404, {'error': 'No disponible sin conexión'});
}

Future<real.Response> post(
  Uri url, {
  Map<String, String>? headers,
  Object? body,
  Encoding? encoding,
}) async {
  final target = _parse(url);
  if (target == null || target.id != null) {
    return real.post(url, headers: headers, body: body, encoding: encoding);
  }

  final store = OfflineStore.instance;
  final sync = SyncService.instance;
  final data = _decodeBody(body);

  if (await sync.ensureOnline()) {
    await _flushIfPending();
    final changed = await store.resolveTemps(data);
    final response = await _network(
      () => real.post(url, headers: headers, body: changed ? jsonEncode(data) : body, encoding: encoding),
    );
    if (response != null) {
      if (response.statusCode == 200 || response.statusCode == 201) {
        final created = _tryDecodeMap(response.body);
        if (created != null) await store.upsert(target.entity, created);
      }
      return response;
    }
  }

  // Sin conexión: se guarda localmente con un id temporal y se envía después
  final tempId = store.newTempId();
  data['id'] = tempId;
  await store.upsert(target.entity, data);
  await store.enqueue(target.entity, 'create', tempId, data);
  return _json(201, data);
}

Future<real.Response> put(
  Uri url, {
  Map<String, String>? headers,
  Object? body,
  Encoding? encoding,
}) async {
  final target = _parse(url);
  if (target == null || target.id == null) {
    return real.put(url, headers: headers, body: body, encoding: encoding);
  }

  final store = OfflineStore.instance;
  final sync = SyncService.instance;
  final data = _decodeBody(body);

  var id = await store.resolveId(target.id!);
  if (id > 0 && await sync.ensureOnline()) {
    await _flushIfPending();
    id = await store.resolveId(target.id!);
    await store.resolveTemps(data);
    data['id'] = id;
    final response = await _network(
      () => real.put(
        Uri.parse(ApiConfig.endpoint('${target.entity}/$id')),
        headers: headers,
        body: jsonEncode(data),
        encoding: encoding,
      ),
    );
    if (response != null) {
      if (response.statusCode == 200) {
        final updated = _tryDecodeMap(response.body);
        if (updated != null) await store.upsert(target.entity, updated);
      }
      return response;
    }
  }

  // Sin conexión (o el registro aún no existe en el servidor): se guarda local y se envía después
  data['id'] = id;
  await store.upsert(target.entity, data);
  final merged = await store.mergeIntoPendingCreate(target.entity, id, data);
  if (!merged) await store.enqueue(target.entity, 'update', id, data);
  return _json(200, data);
}

Future<real.Response> delete(
  Uri url, {
  Map<String, String>? headers,
  Object? body,
  Encoding? encoding,
}) async {
  final target = _parse(url);
  if (target == null || target.id == null) {
    return real.delete(url, headers: headers, body: body, encoding: encoding);
  }

  final store = OfflineStore.instance;
  final sync = SyncService.instance;

  var id = await store.resolveId(target.id!);
  if (id > 0 && await sync.ensureOnline()) {
    await _flushIfPending();
    id = await store.resolveId(target.id!);
    final response = await _network(
      () => real.delete(Uri.parse(ApiConfig.endpoint('${target.entity}/$id')), headers: headers),
    );
    if (response != null) {
      if (response.statusCode == 200 || response.statusCode == 204 || response.statusCode == 404) {
        await store.remove(target.entity, id);
      }
      return response;
    }
  }

  // Sin conexión
  await store.remove(target.entity, id);
  if (id < 0) {
    // Se creó y se borró sin conexión: nunca llegó al servidor, no hay nada que enviar
    await store.dropPendingFor(target.entity, id);
  } else {
    await store.dropPendingFor(target.entity, id, onlyOp: 'update');
    await store.enqueue(target.entity, 'delete', id, null);
  }
  return real.Response('', 204);
}
