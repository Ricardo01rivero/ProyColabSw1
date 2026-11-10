import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Operación pendiente de enviar al servidor (cola de sincronización).
class PendingOp {
  final int opId;
  final String entity; // p. ej. "productos"
  final String op; // create | update | delete
  final int itemId; // id del registro (negativo si todavía no existe en el servidor)
  final Map<String, dynamic>? payload;
  final int attempts;

  PendingOp({
    required this.opId,
    required this.entity,
    required this.op,
    required this.itemId,
    required this.payload,
    required this.attempts,
  });
}

/// Base de datos local (SQLite) con:
///  - cache: copia de los registros del servidor para poder leerlos sin conexión.
///  - outbox: cola de cambios hechos sin conexión, pendientes de enviar.
///  - id_map: relación entre ids temporales (negativos) e ids reales del servidor.
class OfflineStore {
  OfflineStore._();
  static final OfflineStore instance = OfflineStore._();

  Database? _db;
  int _lastTempId = 0;

  /// Cantidad de cambios que aún no se enviaron al servidor.
  final ValueNotifier<int> pendingCount = ValueNotifier<int>(0);

  Future<Database> get _database async {
    final existing = _db;
    if (existing != null) return existing;
    final path = p.join(await getDatabasesPath(), 'offline_cache.db');
    return _db = await openDatabase(path, version: 1, onCreate: _createTables);
  }

  /// Abre una base en la ruta indicada (se usa en las pruebas automáticas).
  Future<void> openAt(String path) async {
    await _db?.close();
    _db = await openDatabase(path, version: 1, onCreate: _createTables);
    await _refreshPending();
  }

  static Future<void> _createTables(Database db, int version) async {
    await db.execute(
      'CREATE TABLE cache (entity TEXT NOT NULL, id INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (entity, id))',
    );
    await db.execute(
      'CREATE TABLE outbox (op_id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, op TEXT NOT NULL, '
      'item_id INTEGER NOT NULL, payload TEXT, attempts INTEGER NOT NULL DEFAULT 0)',
    );
    await db.execute('CREATE TABLE id_map (temp_id INTEGER PRIMARY KEY, real_id INTEGER NOT NULL)');
  }

  Future<void> init() async {
    await _database;
    await _refreshPending();
  }

  Future<void> _refreshPending() async {
    final db = await _database;
    final rows = await db.rawQuery('SELECT COUNT(*) AS c FROM outbox');
    pendingCount.value = (rows.first['c'] as int?) ?? 0;
  }

  /// Id temporal (negativo y único) para un registro creado sin conexión.
  int newTempId() {
    final candidate = -DateTime.now().millisecondsSinceEpoch;
    _lastTempId = candidate < _lastTempId ? candidate : _lastTempId - 1;
    return _lastTempId;
  }

  // ---------------------------------------------------------------- cache

  /// Reemplaza la copia local de una entidad por la lista que devolvió el servidor.
  /// Los registros creados sin conexión (id negativo) se conservan hasta sincronizarse.
  Future<void> replaceAll(String entity, List<Map<String, dynamic>> items) async {
    final db = await _database;
    await db.transaction((txn) async {
      await txn.delete('cache', where: 'entity = ? AND id > 0', whereArgs: [entity]);
      final batch = txn.batch();
      for (final item in items) {
        batch.insert(
          'cache',
          {'entity': entity, 'id': item['id'], 'json': jsonEncode(item)},
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
      await batch.commit(noResult: true);
    });
  }

  Future<void> upsert(String entity, Map<String, dynamic> item) async {
    final db = await _database;
    await db.insert(
      'cache',
      {'entity': entity, 'id': item['id'], 'json': jsonEncode(item)},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> remove(String entity, int id) async {
    final db = await _database;
    await db.delete('cache', where: 'entity = ? AND id = ?', whereArgs: [entity, id]);
  }

  Future<List<Map<String, dynamic>>> getAll(String entity) async {
    final db = await _database;
    final rows = await db.query(
      'cache',
      where: 'entity = ?',
      whereArgs: [entity],
      orderBy: 'CASE WHEN id < 0 THEN 1 ELSE 0 END, id',
    );
    return rows.map((r) => jsonDecode(r['json'] as String) as Map<String, dynamic>).toList();
  }

  Future<Map<String, dynamic>?> getOne(String entity, int id) async {
    final db = await _database;
    final rows = await db.query('cache', where: 'entity = ? AND id = ?', whereArgs: [entity, id]);
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['json'] as String) as Map<String, dynamic>;
  }

  // --------------------------------------------------------------- outbox

  /// Agrega un cambio a la cola. Un nuevo "update" reemplaza a otro "update" pendiente del mismo registro.
  Future<void> enqueue(String entity, String op, int itemId, Map<String, dynamic>? payload) async {
    final db = await _database;
    if (op == 'update') {
      await db.delete(
        'outbox',
        where: 'entity = ? AND item_id = ? AND op = ?',
        whereArgs: [entity, itemId, 'update'],
      );
    }
    await db.insert('outbox', {
      'entity': entity,
      'op': op,
      'item_id': itemId,
      'payload': payload == null ? null : jsonEncode(payload),
      'attempts': 0,
    });
    await _refreshPending();
  }

  /// Si el registro todavía no existe en el servidor (create pendiente), actualiza ese create en vez de
  /// encolar otro cambio. Devuelve true si había un create pendiente.
  Future<bool> mergeIntoPendingCreate(String entity, int itemId, Map<String, dynamic> payload) async {
    final db = await _database;
    final count = await db.update(
      'outbox',
      {'payload': jsonEncode(payload)},
      where: 'entity = ? AND item_id = ? AND op = ?',
      whereArgs: [entity, itemId, 'create'],
    );
    return count > 0;
  }

  /// Quita de la cola todo lo pendiente de un registro (p. ej. se creó y se borró sin conexión).
  Future<void> dropPendingFor(String entity, int itemId, {String? onlyOp}) async {
    final db = await _database;
    if (onlyOp == null) {
      await db.delete('outbox', where: 'entity = ? AND item_id = ?', whereArgs: [entity, itemId]);
    } else {
      await db.delete(
        'outbox',
        where: 'entity = ? AND item_id = ? AND op = ?',
        whereArgs: [entity, itemId, onlyOp],
      );
    }
    await _refreshPending();
  }

  Future<List<PendingOp>> pendingOps() async {
    final db = await _database;
    final rows = await db.query('outbox', orderBy: 'op_id');
    return rows.map((r) {
      final payload = r['payload'] as String?;
      return PendingOp(
        opId: r['op_id'] as int,
        entity: r['entity'] as String,
        op: r['op'] as String,
        itemId: r['item_id'] as int,
        payload: payload == null ? null : jsonDecode(payload) as Map<String, dynamic>,
        attempts: r['attempts'] as int,
      );
    }).toList();
  }

  Future<void> deleteOp(int opId) async {
    final db = await _database;
    await db.delete('outbox', where: 'op_id = ?', whereArgs: [opId]);
    await _refreshPending();
  }

  /// Suma un intento fallido y devuelve el total de intentos.
  Future<int> bumpAttempts(int opId) async {
    final db = await _database;
    await db.rawUpdate('UPDATE outbox SET attempts = attempts + 1 WHERE op_id = ?', [opId]);
    final rows = await db.query('outbox', columns: ['attempts'], where: 'op_id = ?', whereArgs: [opId]);
    return rows.isEmpty ? 0 : rows.first['attempts'] as int;
  }

  // ------------------------------------------------------ ids temporales

  /// Un registro creado sin conexión ya recibió su id real: se guarda la equivalencia y se corrigen
  /// todas las referencias (claves foráneas) que apuntaban al id temporal, en la cache y en la cola.
  Future<void> remapId(int tempId, int realId) async {
    final db = await _database;
    await db.insert(
      'id_map',
      {'temp_id': tempId, 'real_id': realId},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );

    for (final row in await db.query('cache')) {
      final map = jsonDecode(row['json'] as String) as Map<String, dynamic>;
      if (_replaceRefs(map, {tempId: realId})) {
        await db.update(
          'cache',
          {'json': jsonEncode(map)},
          where: 'entity = ? AND id = ?',
          whereArgs: [row['entity'], row['id']],
        );
      }
    }

    for (final row in await db.query('outbox')) {
      final values = <String, Object?>{};
      if (row['item_id'] == tempId) values['item_id'] = realId;
      final raw = row['payload'] as String?;
      if (raw != null) {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        if (_replaceRefs(map, {tempId: realId})) values['payload'] = jsonEncode(map);
      }
      if (values.isNotEmpty) {
        await db.update('outbox', values, where: 'op_id = ?', whereArgs: [row['op_id']]);
      }
    }
  }

  /// Devuelve el id real si el id temporal ya se sincronizó; si no, el mismo id.
  Future<int> resolveId(int id) async {
    if (id >= 0) return id;
    final db = await _database;
    final rows = await db.query('id_map', where: 'temp_id = ?', whereArgs: [id]);
    return rows.isEmpty ? id : rows.first['real_id'] as int;
  }

  /// Reemplaza en [data] los ids temporales (negativos) que ya tienen id real. Devuelve true si cambió algo.
  Future<bool> resolveTemps(Map<String, dynamic> data) async {
    final db = await _database;
    final mapping = <int, int>{};
    for (final entry in data.entries) {
      final value = entry.value;
      if (entry.key != 'id' && value is int && value < 0) {
        final rows = await db.query('id_map', where: 'temp_id = ?', whereArgs: [value]);
        if (rows.isNotEmpty) mapping[value] = rows.first['real_id'] as int;
      }
    }
    return mapping.isEmpty ? false : _replaceRefs(data, mapping);
  }

  static bool _replaceRefs(Map<String, dynamic> map, Map<int, int> mapping) {
    var changed = false;
    for (final key in map.keys.toList()) {
      final value = map[key];
      if (key != 'id' && value is int && mapping.containsKey(value)) {
        map[key] = mapping[value];
        changed = true;
      }
    }
    return changed;
  }
}
