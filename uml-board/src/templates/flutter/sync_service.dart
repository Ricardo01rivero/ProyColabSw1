import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as real;

import '../config/api_config.dart';
import 'offline_store.dart';

enum _Outcome { ok, failed, offline }

/// Detecta si hay conexión con el servidor y envía la cola de cambios hechos sin conexión.
class SyncService {
  SyncService._();
  static final SyncService instance = SyncService._();

  /// true si el último intento de hablar con el servidor funcionó.
  final ValueNotifier<bool> online = ValueNotifier<bool>(true);

  /// true mientras se está enviando la cola.
  final ValueNotifier<bool> syncing = ValueNotifier<bool>(false);

  /// Último problema al sincronizar (se muestra en el aviso de la app).
  final ValueNotifier<String?> lastError = ValueNotifier<String?>(null);

  Timer? _timer;
  DateTime _lastCheck = DateTime.fromMillisecondsSinceEpoch(0);
  bool _running = false;

  static const Duration _requestTimeout = Duration(seconds: 8);
  static const int _maxAttempts = 3;

  /// Revisa la conexión cada 15 segundos y envía lo pendiente en cuanto vuelve.
  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => syncNow());
    syncNow();
  }

  void stop() => _timer?.cancel();

  void markOnline(bool value) {
    if (online.value != value) online.value = value;
  }

  /// Rápido: si ya se sabe que no hay conexión, no vuelve a intentar durante 8 segundos.
  Future<bool> ensureOnline() async {
    if (online.value) return true;
    if (DateTime.now().difference(_lastCheck) < const Duration(seconds: 8)) return false;
    return _ping();
  }

  Future<bool> _ping() async {
    _lastCheck = DateTime.now();
    try {
      await real.get(Uri.parse(ApiConfig.baseUrl)).timeout(const Duration(seconds: 4));
      markOnline(true);
      return true;
    } catch (_) {
      markOnline(false);
      return false;
    }
  }

  void clearError() => lastError.value = null;

  /// Envía los cambios pendientes, en orden. Se detiene si se pierde la conexión.
  Future<void> syncNow() async {
    if (_running) return;
    _running = true;
    try {
      if (!await ensureOnline()) return;
      final store = OfflineStore.instance;
      final ops = await store.pendingOps();
      if (ops.isEmpty) return;

      syncing.value = true;
      for (final op in ops) {
        final outcome = await _apply(op);
        if (outcome == _Outcome.offline) {
          markOnline(false);
          break;
        }
      }
    } finally {
      syncing.value = false;
      _running = false;
    }
  }

  Future<_Outcome> _apply(PendingOp op) async {
    final store = OfflineStore.instance;
    real.Response? response;

    try {
      switch (op.op) {
        case 'create':
          final data = Map<String, dynamic>.from(op.payload ?? {})..remove('id');
          await store.resolveTemps(data);
          response = await real
              .post(
                Uri.parse(ApiConfig.endpoint(op.entity)),
                headers: ApiConfig.headers,
                body: jsonEncode(data),
              )
              .timeout(_requestTimeout);
          if (response.statusCode == 200 || response.statusCode == 201) {
            final created = jsonDecode(response.body) as Map<String, dynamic>;
            await store.remove(op.entity, op.itemId);
            await store.upsert(op.entity, created);
            await store.remapId(op.itemId, created['id'] as int);
            await store.deleteOp(op.opId);
            return _Outcome.ok;
          }
          break;

        case 'update':
          final id = await store.resolveId(op.itemId);
          final data = Map<String, dynamic>.from(op.payload ?? {})..['id'] = id;
          await store.resolveTemps(data);
          response = await real
              .put(
                Uri.parse(ApiConfig.endpoint('${op.entity}/$id')),
                headers: ApiConfig.headers,
                body: jsonEncode(data),
              )
              .timeout(_requestTimeout);
          if (response.statusCode == 200) {
            await store.upsert(op.entity, jsonDecode(response.body) as Map<String, dynamic>);
            await store.deleteOp(op.opId);
            return _Outcome.ok;
          }
          if (response.statusCode == 404) {
            // El registro ya no existe en el servidor: se descarta el cambio
            await store.remove(op.entity, id);
            await store.deleteOp(op.opId);
            return _Outcome.ok;
          }
          break;

        case 'delete':
          final id = await store.resolveId(op.itemId);
          response = await real
              .delete(Uri.parse(ApiConfig.endpoint('${op.entity}/$id')), headers: ApiConfig.headers)
              .timeout(_requestTimeout);
          if (response.statusCode == 200 || response.statusCode == 204 || response.statusCode == 404) {
            await store.deleteOp(op.opId);
            return _Outcome.ok;
          }
          break;
      }
    } on TimeoutException {
      return _Outcome.offline;
    } on real.ClientException {
      return _Outcome.offline;
    } catch (_) {
      // Sin respuesta = sin red (SocketException u otro error de conexión);
      // con respuesta, es que el servidor devolvió algo que no se pudo leer.
      if (response == null) return _Outcome.offline;
      return _fail(op, 'respuesta inválida');
    }

    // El servidor respondió con un error: se reintenta unas veces y luego se descarta
    return _fail(op, 'HTTP ${response?.statusCode}');
  }

  Future<_Outcome> _fail(PendingOp op, String reason) async {
    final store = OfflineStore.instance;
    final attempts = await store.bumpAttempts(op.opId);
    if (attempts >= _maxAttempts) {
      if (op.op == 'create') await store.remove(op.entity, op.itemId);
      await store.deleteOp(op.opId);
      lastError.value =
          'No se pudo sincronizar un cambio en ${op.entity} ($reason). El servidor lo rechazó y se descartó.';
    }
    return _Outcome.failed;
  }
}
