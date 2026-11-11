/* eslint-disable no-useless-escape */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { NodeType, EdgeType } from './umlConstants';
import { foreignKeysFor } from './fkRules';
import { normalizeAttributeNamesForCode } from './umlConstants';

// Utilidades
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function mapDartType(type: string): string {
  switch (type) {
    case 'Integer':
      return 'int';
    case 'Float':
      return 'double';
    case 'Boolean':
      return 'bool';
    case 'Date':
      return 'DateTime';
    case 'String':
      return 'String';
    default:
      return 'String';
  }
}

// Obtiene el primer atributo después del ID para usar como clave sustituta
function getDisplayAttribute(className: string, nodes: NodeType[]): string {
  const targetClass = nodes.find(node => node.label === className);
  if (!targetClass || !targetClass.attributes) return 'nombre'; // fallback

  const nonIdAttributes = targetClass.attributes.filter(attr => attr.name !== 'id');
  return nonIdAttributes.length > 0 ? nonIdAttributes[0].name : 'nombre';
}

// Detecta si una clase tiene relaciones muchos-a-muchos a través de entidades asociativas
function getManyToManyRelations(
  cls: NodeType,
  nodes: NodeType[],
  edges: EdgeType[]
): Array<{
  associativeEntity: NodeType;
  relatedEntity: NodeType;
  isMainEntity: boolean;
}> {
  const manyToManyRelations: Array<{
    associativeEntity: NodeType;
    relatedEntity: NodeType;
    isMainEntity: boolean;
  }> = [];

  // Buscar entidades asociativas que están conectadas a esta clase
  const associativeEntities = nodes.filter(node => node.asociativa);

  associativeEntities.forEach(assocEntity => {
    // Verificar si esta entidad asociativa está conectada a la clase actual
    const edgeToAssoc = edges.find(
      edge =>
        (edge.source === cls.id && edge.target === assocEntity.id) ||
        (edge.source === assocEntity.id && edge.target === cls.id)
    );

    if (edgeToAssoc) {
      // Buscar la otra entidad conectada a la misma entidad asociativa
      const otherEdges = edges.filter(
        edge =>
          (edge.source === assocEntity.id || edge.target === assocEntity.id) &&
          edge.source !== cls.id &&
          edge.target !== cls.id
      );

      otherEdges.forEach(otherEdge => {
        const relatedEntityId =
          otherEdge.source === assocEntity.id ? otherEdge.target : otherEdge.source;
        const relatedEntity = nodes.find(node => node.id === relatedEntityId && !node.asociativa);

        if (relatedEntity) {
          // Determinar cuál es la entidad principal (ID menor)
          const isMainEntity = cls.id < relatedEntity.id;

          manyToManyRelations.push({
            associativeEntity: assocEntity,
            relatedEntity,
            isMainEntity,
          });
        }
      });
    }
  });

  return manyToManyRelations;
}

// Obtiene campos foráneos para una clase (misma regla que el backend: ver fkRules.ts)
function getForeignKeyFields(
  cls: NodeType,
  nodes: NodeType[],
  edges: EdgeType[]
): Array<{ fieldName: string; className: string }> {
  // Evitar duplicados con atributos que la clase ya tiene (entidades importadas)
  const existingAttributeNames = new Set((cls.attributes || []).map(attr => attr.name));
  return foreignKeysFor(cls, nodes, edges).filter(fk => !existingAttributeNames.has(fk.fieldName));
}

// Genera pubspec.yaml
function generatePubspecYaml(): string {
  return `name: flutter_mvp
description: A Flutter CRUD project generated automatically

publish_to: 'none'

version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: ">=3.10.0"

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.2
  http: ^1.1.0
  shared_preferences: ^2.2.0
  sqflite: ^2.3.0
  path: ^1.8.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^2.0.0

flutter:
  uses-material-design: true
`;
}

// Genera main.dart
function generateMainDart(classes: NodeType[], allClasses: NodeType[] = classes): string {
  const offlineEntities = allClasses.map(c => `'${c.label.toLowerCase()}s'`).join(', ');
  const routes = classes
    .map(cls => {
      const className = cls.label.toLowerCase();
      return `      '/${className}': (context) => ${capitalizeFirst(cls.label)}ListScreen(),`;
    })
    .join('\n');

  const imports = classes
    .map(cls => {
      const className = cls.label.toLowerCase();
      return `import 'screens/${className}/${className}_list_screen.dart';`;
    })
    .join('\n');

  return `import 'package:flutter/material.dart';
${imports}
import 'widgets/app_drawer.dart';
import 'config/api_config.dart';
import 'offline/sync_service.dart';
import 'widgets/sync_banner.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Carga la dirección del backend guardada en el dispositivo
  await ApiConfig.load();
  // Modo sin conexión: base local SQLite + cola de cambios pendientes
  await SyncService.instance.init(entities: [${offlineEntities}]);
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter CRUD Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      // Aviso de "sin conexión / cambios pendientes" encima de todas las pantallas
      builder: (context, child) => Column(
        children: [const SyncBanner(), Expanded(child: child ?? const SizedBox.shrink())],
      ),
      home: const HomeScreen(),
      routes: {
${routes}
      },
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CRUD Demo'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      drawer: const AppDrawer(),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.dashboard, size: 80, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'Bienvenido al Sistema CRUD',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            Text(
              'Selecciona una entidad del menú lateral',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
`;
}

// Genera modelo para una clase específica
function generateModelForClass(cls: NodeType, nodes: NodeType[], edges: EdgeType[]): string {
  const className = capitalizeFirst(cls.label);

  // Obtener todas las claves foráneas que deberían estar
  const foreignKeys = getForeignKeyFields(cls, nodes, edges);

  // Atributos propios de la clase (excluyendo 'id')
  const ownAttributes = (cls.attributes || []).filter(attr => attr.name !== 'id');

  // Crear un conjunto unificado de todos los campos únicos
  const allFieldsSet = new Set<string>();
  const fieldInfoMap = new Map<string, { isAttribute: boolean; attr?: any; fk?: any }>(); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Agregar ID primero
  allFieldsSet.add('id');
  fieldInfoMap.set('id', { isAttribute: false });

  // Agregar atributos propios
  ownAttributes.forEach(attr => {
    allFieldsSet.add(attr.name);
    fieldInfoMap.set(attr.name, { isAttribute: true, attr });
  });

  // Agregar FK solo si no existen ya como atributos
  foreignKeys.forEach(fk => {
    if (!allFieldsSet.has(fk.fieldName)) {
      allFieldsSet.add(fk.fieldName);
      fieldInfoMap.set(fk.fieldName, { isAttribute: false, fk });
    }
  });

  const allFields = Array.from(allFieldsSet);

  console.log(`🔧 Generando modelo ${className}:`);
  console.log(`   Atributos de entidad: [${ownAttributes.map(a => a.name).join(', ')}]`);
  console.log(`   FK detectadas: [${foreignKeys.map(fk => fk.fieldName).join(', ')}]`);
  console.log(`   Campos finales únicos: [${allFields.join(', ')}]`);

  const constructorParams = allFields
    .map(field => {
      if (field === 'id') return 'required this.id';
      const fieldInfo = fieldInfoMap.get(field);
      if (fieldInfo?.isAttribute) {
        return `required this.${field}`;
      }
      return `this.${field}`;
    })
    .join(',\n    ');

  const fieldDeclarations = allFields
    .map(field => {
      if (field === 'id') return '  final int id;';
      const fieldInfo = fieldInfoMap.get(field);
      if (fieldInfo?.isAttribute && fieldInfo.attr) {
        return `  final ${mapDartType(fieldInfo.attr.datatype)} ${field};`;
      }
      return `  final int? ${field};`;
    })
    .join('\n');

  const fromJsonFields = allFields
    .map(field => {
      // Lectura tolerante: un valor null o de otro tipo numérico no debe
      // romper toda la lista (antes un solo registro incompleto la vaciaba).
      if (field === 'id') return "      id: (json['id'] as num?)?.toInt() ?? 0";
      const fieldInfo = fieldInfoMap.get(field);
      if (fieldInfo?.isAttribute && fieldInfo.attr) {
        const dartType = mapDartType(fieldInfo.attr.datatype);
        switch (dartType) {
          case 'DateTime':
            return `      ${field}: DateTime.tryParse(json['${field}']?.toString() ?? '') ?? DateTime.now()`;
          case 'int':
            return `      ${field}: (json['${field}'] as num?)?.toInt() ?? 0`;
          case 'double':
            return `      ${field}: (json['${field}'] as num?)?.toDouble() ?? 0.0`;
          case 'bool':
            return `      ${field}: json['${field}'] == true`;
          default:
            return `      ${field}: json['${field}']?.toString() ?? ''`;
        }
      }
      return `      ${field}: (json['${field}'] as num?)?.toInt()`;
    })
    .join(',\n');

  const toJsonFields = allFields
    .map(field => {
      const fieldInfo = fieldInfoMap.get(field);
      if (
        fieldInfo?.isAttribute &&
        fieldInfo.attr &&
        mapDartType(fieldInfo.attr.datatype) === 'DateTime'
      ) {
        return `      '${field}': ${field}.toIso8601String()`;
      }
      return `      '${field}': ${field}`;
    })
    .join(',\n');

  return `class ${className} {
${fieldDeclarations}

  ${className}({
    ${constructorParams},
  });

  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}(
${fromJsonFields},
    );
  }

  Map<String, dynamic> toJson() {
    return {
${toJsonFields},
    };
  }
}
`;
}

// Genera servicio para una clase específica
function generateServiceForClass(cls: NodeType): string {
  const className = capitalizeFirst(cls.label);
  const endpoint = cls.label.toLowerCase() + 's';

  return `import '../models/${cls.label.toLowerCase()}_model.dart';
import '../offline/offline_repository.dart';

/// CRUD de ${className} contra el backend, con soporte sin conexión
/// (copia local en SQLite y cola de sincronización: ver lib/offline/).
class ${className}Service {
  final OfflineRepository _repo = OfflineRepository('${endpoint}');

  Future<List<${className}>> getAll() async =>
      (await _repo.getAll()).map((json) => ${className}.fromJson(json)).toList();

  Future<${className}?> getById(int id) async {
    final json = await _repo.getById(id);
    return json == null ? null : ${className}.fromJson(json);
  }

  Future<${className}?> create(${className} item) async {
    final json = await _repo.create(item.toJson());
    return json == null ? null : ${className}.fromJson(json);
  }

  Future<${className}?> update(${className} item) async {
    final json = await _repo.update(item.id, item.toJson());
    return json == null ? null : ${className}.fromJson(json);
  }

  Future<bool> delete(int id) => _repo.delete(id);

  /// Verifica si el backend responde
  Future<bool> checkConnection() => _repo.checkConnection();
}
`;
}

// Genera pantalla de lista para una clase
function generateListScreen(cls: NodeType, nodes: NodeType[], edges: EdgeType[]): string {
  const className = capitalizeFirst(cls.label);
  const endpoint = cls.label.toLowerCase();
  const ownAttributes = (cls.attributes || []).filter(attr => attr.name !== 'id');
  const foreignKeys = getForeignKeyFields(cls, nodes, edges);
  const manyToManyRelations = getManyToManyRelations(cls, nodes, edges).filter(
    rel => rel.isMainEntity
  );

  // Generar filas de detalles para atributos propios
  const ownAttributeRows = ownAttributes
    .map(attr => {
      const label = capitalizeFirst(attr.name);
      const dartType = mapDartType(attr.datatype);

      if (dartType === 'DateTime') {
        return `        _buildDetailRow('${label}', item.${attr.name}.toString().substring(0, 16)),`;
      } else {
        return `        _buildDetailRow('${label}', item.${attr.name}.toString()),`;
      }
    })
    .join('\n');

  // Generar filas de detalles para claves foráneas
  const foreignKeyRows = foreignKeys
    .map(fk => {
      const label = capitalizeFirst(fk.fieldName.replace('Id', ''));
      // const displayAttr = getDisplayAttribute(fk.className, nodes);
      return `        _buildDetailRow('${label}', item.${fk.fieldName} != null ? '\${item.${fk.fieldName}} - \${_get${fk.className}Display(item.${fk.fieldName}!)}' : 'N/A'),`;
    })
    .join('\n');

  // Combinar todas las filas
  const allDetailRows = [ownAttributeRows, foreignKeyRows]
    .filter(rows => rows.length > 0)
    .join('\n');
  const detailRowsCode = allDetailRows || '        // No hay atributos adicionales';

  // Generar botones adicionales para relaciones muchos-a-muchos
  const manyToManyButtons = manyToManyRelations
    .map(rel => {
      const assocClassName = capitalizeFirst(rel.associativeEntity.label);
      return `                                IconButton(
                                  icon: const Icon(Icons.list_alt, color: Colors.green),
                                  onPressed: () => _navigateToDetails(item.id, '${rel.associativeEntity.label}'),
                                  tooltip: 'Ver ${assocClassName}s',
                                ),`;
    })
    .join('\n');

  const actionButtons = `                                IconButton(
                                  icon: const Icon(Icons.edit, color: Colors.blue),
                                  onPressed: () => _navigateToForm(item),
                                  tooltip: 'Editar',
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  onPressed: () => _showDeleteDialog(item.id),
                                  tooltip: 'Eliminar',
                                ),${manyToManyButtons ? '\n' + manyToManyButtons : ''}`;

  // Generar imports adicionales para entidades asociativas
  const associativeImports = manyToManyRelations
    .map(rel => `import '${rel.associativeEntity.label.toLowerCase()}_details_screen.dart';`)
    .join('\n');

  return `import 'package:flutter/material.dart';
import 'dart:convert';
import '../../offline/offline_http.dart' as http;
import '../../services/${endpoint}_service.dart';
import '../../models/${endpoint}_model.dart';
import '../../config/api_config.dart';
import '${endpoint}_form_screen.dart';
${associativeImports}

class ${className}ListScreen extends StatefulWidget {
  const ${className}ListScreen({Key? key}) : super(key: key);

  @override
  State<${className}ListScreen> createState() => _${className}ListScreenState();
}

class _${className}ListScreenState extends State<${className}ListScreen> {
  final ${className}Service _service = ${className}Service();
  List<${className}> _items = [];
  bool _isLoading = true;
${foreignKeys.map(fk => `  Map<int, String> _${fk.className.toLowerCase()}Map = {};`).join('\n')}

  @override
  void initState() {
    super.initState();
    _loadItems();
${foreignKeys.map(fk => `    _load${fk.className}Data();`).join('\n')}
  }

${foreignKeys
  .map(fk => {
    const relatedEndpoint = fk.className.toLowerCase() + 's';
    const displayAttr = getDisplayAttribute(fk.className, nodes);
    return `  Future<void> _load${fk.className}Data() async {
    try {
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${relatedEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        final Map<int, String> tempMap = {};
        
        for (var item in jsonList) {
          final id = item['id'] as int;
          final displayValue = item['${displayAttr}']?.toString() ?? 'Sin nombre';
          tempMap[id] = displayValue;
        }
        
        setState(() {
          _${fk.className.toLowerCase()}Map = tempMap;
        });
      }
    } catch (e) {
      print('Error loading ${fk.className} data: \$e');
      // En caso de error, mantener el mapa vacío
      setState(() {
        _${fk.className.toLowerCase()}Map = {};
      });
    }
  }

  String _get${fk.className}Display(int id) {
    final display = _${fk.className.toLowerCase()}Map[id];
    if (display == null) {
      // Si no está en el mapa, intentar cargar los datos si aún no se han cargado
      if (_${fk.className.toLowerCase()}Map.isEmpty) {
        _load${fk.className}Data();
        return 'Cargando...';
      }
      return 'No encontrado';
    }
    return display;
  }`;
  })
  .join('\n\n')}

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    final items = await _service.getAll();
    setState(() {
      _items = items;
      _isLoading = false;
    });
  }

  Future<void> _deleteItem(int id) async {
    final success = await _service.delete(id);
    if (success) {
      _loadItems();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Item eliminado exitosamente')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al eliminar item')),
      );
    }
  }

  void _navigateToForm([${className}? item]) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => ${className}FormScreen(item: item),
      ),
    );
    if (result == true) {
      _loadItems();
    }
  }

${manyToManyRelations
  .map(rel => {
    const assocClassName = capitalizeFirst(rel.associativeEntity.label);
    return `  void _navigateToDetails(int ${cls.label.toLowerCase()}Id, String detailType) async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (context) => ${assocClassName}DetailsScreen(${cls.label.toLowerCase()}Id: ${cls.label.toLowerCase()}Id),
      ),
    );
    if (result == true) {
      _loadItems();
    }
  }`;
  })
  .join('\n\n')}

  Widget _buildItemDetails(${className} item) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ID siempre primero
        _buildDetailRow('ID', item.id.toString()),
${detailRowsCode}
      ],
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: Colors.deepPurple,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${className}s'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _navigateToForm(),
            tooltip: 'Agregar ${className}',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _items.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.inbox, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        'No hay elementos disponibles',
                        style: TextStyle(fontSize: 16, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = _items[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      elevation: 4,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Header solo con botones de acción
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
${actionButtons}
                              ],
                            ),
                            // Detalles de todos los atributos
                            _buildItemDetails(item),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  void _showDeleteDialog(int id) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar eliminación'),
        content: const Text('¿Estás seguro de que deseas eliminar este elemento?\\n\\nEsta acción no se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(context);
              _deleteItem(id);
            },
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
  }
}
`;
}

// Genera pantalla de detalles para entidades asociativas (muchos-a-muchos)
function generateDetailsScreen(
  associativeEntity: NodeType,
  mainEntity: NodeType,
  relatedEntity: NodeType,
  nodes: NodeType[]
): string {
  const assocClassName = capitalizeFirst(associativeEntity.label);
  const mainClassName = capitalizeFirst(mainEntity.label);
  const relatedClassName = capitalizeFirst(relatedEntity.label);
  const mainFieldName = mainEntity.label.toLowerCase() + 'Id';
  const relatedFieldName = relatedEntity.label.toLowerCase() + 'Id';
  const assocEndpoint = associativeEntity.label.toLowerCase() + 's';
  const relatedEndpoint = relatedEntity.label.toLowerCase() + 's';

  const ownAttributes = (associativeEntity.attributes || []).filter(
    attr => attr.name !== 'id' && attr.name !== mainFieldName && attr.name !== relatedFieldName
  );

  const relatedDisplayAttr = getDisplayAttribute(relatedEntity.label, nodes);

  // Generar filas de detalles para atributos propios de la entidad asociativa
  const detailRows = ownAttributes
    .map(attr => {
      const label = capitalizeFirst(attr.name);
      const dartType = mapDartType(attr.datatype);

      if (dartType === 'DateTime') {
        return `                            _buildDetailRow('${label}', detail.${attr.name}.toString().substring(0, 16)),`;
      } else {
        return `                            _buildDetailRow('${label}', detail.${attr.name}.toString()),`;
      }
    })
    .join('\n');

  return `import 'package:flutter/material.dart';
import 'dart:convert';
import '../../offline/offline_http.dart' as http;
import '../../models/${associativeEntity.label.toLowerCase()}_model.dart';
import '../../config/api_config.dart';
import '${associativeEntity.label.toLowerCase()}_form_dialog.dart';

class ${assocClassName}DetailsScreen extends StatefulWidget {
  final int ${mainEntity.label.toLowerCase()}Id;
  
  const ${assocClassName}DetailsScreen({Key? key, required this.${mainEntity.label.toLowerCase()}Id}) : super(key: key);

  @override
  State<${assocClassName}DetailsScreen> createState() => _${assocClassName}DetailsScreenState();
}

class _${assocClassName}DetailsScreenState extends State<${assocClassName}DetailsScreen> {
  List<${assocClassName}> _details = [];
  Map<int, String> _${relatedEntity.label.toLowerCase()}Map = {};
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDetails();
    _load${relatedClassName}Data();
  }

  Future<void> _loadDetails() async {
    setState(() => _isLoading = true);
    try {
      // Obtener todos los registros primero
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${assocEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        // Filtrar por ${mainFieldName} en el cliente
        final filteredList = jsonList.where((json) => 
          json['${mainFieldName}'] == widget.${mainEntity.label.toLowerCase()}Id
        ).toList();
        
        setState(() {
          _details = filteredList.map((json) => ${assocClassName}.fromJson(json)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error loading details: \$e');
      setState(() {
        _details = [];
        _isLoading = false;
      });
    }
  }

  Future<void> _load${relatedClassName}Data() async {
    try {
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${relatedEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        final Map<int, String> tempMap = {};
        
        for (var item in jsonList) {
          final id = item['id'] as int;
          final displayValue = item['${relatedDisplayAttr}']?.toString() ?? 'Sin nombre';
          tempMap[id] = displayValue;
        }
        
        setState(() {
          _${relatedEntity.label.toLowerCase()}Map = tempMap;
        });
      }
    } catch (e) {
      print('Error loading ${relatedEntity.label} data: \$e');
    }
  }

  String _get${relatedClassName}Display(int? id) {
    if (id == null) return 'N/A';
    return _${relatedEntity.label.toLowerCase()}Map[id] ?? 'Cargando...';
  }



  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: Colors.deepPurple,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Detalles de ${mainClassName}'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _details.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.inbox, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        'No hay detalles disponibles',
                        style: TextStyle(fontSize: 16, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: _details.length,
                  itemBuilder: (context, index) {
                    final detail = _details[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${relatedClassName}: \${_get${relatedClassName}Display(detail.${relatedFieldName})}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
${
  detailRows.length > 0
    ? `                            const SizedBox(height: 8),
${detailRows}`
    : ''
}
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }


}
`;
}

// Genera diálogo de formulario para entidades asociativas
function generateFormDialog(
  associativeEntity: NodeType,
  mainEntity: NodeType,
  relatedEntity: NodeType
): string {
  const assocClassName = capitalizeFirst(associativeEntity.label);
  // const mainClassName = capitalizeFirst(mainEntity.label);
  const relatedClassName = capitalizeFirst(relatedEntity.label);
  const mainFieldName = mainEntity.label.toLowerCase() + 'Id';
  const relatedFieldName = relatedEntity.label.toLowerCase() + 'Id';

  const ownAttributes = (associativeEntity.attributes || []).filter(
    attr => attr.name !== 'id' && attr.name !== mainFieldName && attr.name !== relatedFieldName
  );

  // Generar variables de estado para todos los tipos de atributos
  const allStateVars = ownAttributes
    .map(attr => {
      const dartType = mapDartType(attr.datatype);
      const fieldName = attr.name;

      if (dartType === 'DateTime') {
        return `  DateTime? _selected${capitalizeFirst(fieldName)}Date;`;
      } else if (dartType === 'bool') {
        return `  bool _${fieldName}Value = false;`;
      } else {
        // Para String, int, double usamos controladores
        return `  final _${fieldName}Controller = TextEditingController();`;
      }
    })
    .join('\n');

  // Generar campos del formulario para todos los tipos
  const formFields = ownAttributes
    .map(attr => {
      const dartType = mapDartType(attr.datatype);
      const fieldName = attr.name;
      const capitalizedName = capitalizeFirst(fieldName);

      if (dartType === 'DateTime') {
        return `                InkWell(
                  onTap: _isSaving ? null : () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: _selected${capitalizedName}Date ?? DateTime.now(),
                      firstDate: DateTime(1900),
                      lastDate: DateTime(2100),
                    );
                    if (date != null) {
                      setState(() {
                        _selected${capitalizedName}Date = date;
                      });
                    }
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: '${capitalizedName}',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                    child: Text(
                      _selected${capitalizedName}Date != null
                          ? '\${_selected${capitalizedName}Date!.day}/\${_selected${capitalizedName}Date!.month}/\${_selected${capitalizedName}Date!.year}'
                          : 'Seleccionar fecha',
                      style: TextStyle(
                        color: _selected${capitalizedName}Date != null ? Colors.black87 : Colors.grey,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),`;
      } else if (dartType === 'bool') {
        return `                Row(
                  children: [
                    Checkbox(
                      value: _${fieldName}Value,
                      onChanged: _isSaving ? null : (bool? value) {
                        setState(() {
                          _${fieldName}Value = value ?? false;
                        });
                      },
                    ),
                    const SizedBox(width: 8),
                    Text('${capitalizedName}'),
                  ],
                ),
                const SizedBox(height: 16),`;
      } else {
        // Para String, int, double
        const keyboardType =
          dartType === 'int'
            ? 'TextInputType.number'
            : dartType === 'double'
              ? 'TextInputType.numberWithOptions(decimal: true)'
              : 'TextInputType.text';

        return `                TextFormField(
                  controller: _${fieldName}Controller,
                  enabled: !_isSaving,
                  keyboardType: ${keyboardType},
                  decoration: const InputDecoration(
                    labelText: '${capitalizedName}',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Este campo es requerido';
                    }
                    ${
                      dartType === 'int'
                        ? `
                    if (int.tryParse(value) == null) {
                      return 'Debe ser un número entero';
                    }`
                        : ''
                    }
                    ${
                      dartType === 'double'
                        ? `
                    if (double.tryParse(value) == null) {
                      return 'Debe ser un número válido';
                    }`
                        : ''
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),`;
      }
    })
    .join('\n');

  return `import 'package:flutter/material.dart';
import '../../models/${associativeEntity.label.toLowerCase()}_model.dart';

class ${assocClassName}FormDialog extends StatefulWidget {
  final int ${mainEntity.label.toLowerCase()}Id;
  final Map<int, String> ${relatedEntity.label.toLowerCase()}Options;
  final List<${assocClassName}> existingDetails; // Add this to check for duplicates
  
  const ${assocClassName}FormDialog({
    Key? key, 
    required this.${mainEntity.label.toLowerCase()}Id,
    required this.${relatedEntity.label.toLowerCase()}Options,
    required this.existingDetails,
  }) : super(key: key);

  @override
  State<${assocClassName}FormDialog> createState() => _${assocClassName}FormDialogState();
}

class _${assocClassName}FormDialogState extends State<${assocClassName}FormDialog> {
  final _formKey = GlobalKey<FormState>();
  int? _selected${relatedClassName}Id;
${allStateVars}
  bool _isSaving = false;

  @override
  void dispose() {
${ownAttributes
  .filter(attr => ['String', 'Integer', 'Float'].includes(attr.datatype))
  .map(attr => `    _${attr.name}Controller.dispose();`)
  .join('\n')}
    super.dispose();
  }

  bool _is${relatedClassName}AlreadyEnrolled(int ${relatedEntity.label.toLowerCase()}Id) {
    return widget.existingDetails.any((detail) => detail.${relatedFieldName} == ${relatedEntity.label.toLowerCase()}Id);
  }

  Future<void> _saveDetail() async {
    if (_isSaving) return;
    if (!_formKey.currentState!.validate()) return;
    
    if (_selected${relatedClassName}Id == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Debe seleccionar un ${relatedClassName}')),
      );
      return;
    }

    // Check for duplicate relationship
    if (_is${relatedClassName}AlreadyEnrolled(_selected${relatedClassName}Id!)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Este ${relatedEntity.label.toLowerCase()} ya está relacionado con este ${mainEntity.label.toLowerCase()}'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      final detail = ${assocClassName}(
        id: 0, // Always new
        ${mainFieldName}: widget.${mainEntity.label.toLowerCase()}Id,
        ${relatedFieldName}: _selected${relatedClassName}Id!,
${ownAttributes
  .map(attr => {
    const dartType = mapDartType(attr.datatype);
    const fieldName = attr.name;
    const controllerName = `_${fieldName}Controller`;

    if (dartType === 'DateTime') {
      return `        ${fieldName}: _selected${capitalizeFirst(fieldName)}Date ?? DateTime.now(),`;
    } else if (dartType === 'int') {
      return `        ${fieldName}: int.tryParse(${controllerName}.text) ?? 0,`;
    } else if (dartType === 'double') {
      return `        ${fieldName}: double.tryParse(${controllerName}.text) ?? 0.0,`;
    } else if (dartType === 'bool') {
      return `        ${fieldName}: _${fieldName}Value,`;
    } else {
      // String y otros tipos
      return `        ${fieldName}: ${controllerName}.text.trim(),`;
    }
  })
  .join('\n')}
      );

      if (mounted) {
        Navigator.pop(context, detail);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: \$e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Agregar ${assocClassName}'),
      content: SizedBox(
        width: MediaQuery.of(context).size.width * 0.8,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<int>(
                  value: _selected${relatedClassName}Id,
                  decoration: InputDecoration(
                    labelText: '${relatedClassName}',
                    border: const OutlineInputBorder(),
                    helperText: 'Solo ${relatedEntity.label.toLowerCase()}s no relacionados aparecen disponibles',
                    helperStyle: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  items: widget.${relatedEntity.label.toLowerCase()}Options.entries
                      .where((entry) => !_is${relatedClassName}AlreadyEnrolled(entry.key))
                      .map((entry) {
                    return DropdownMenuItem<int>(
                      value: entry.key,
                      child: Text(entry.value),
                    );
                  }).toList(),
                  onChanged: _isSaving ? null : (int? value) {
                    setState(() {
                      _selected${relatedClassName}Id = value;
                    });
                  },
                  validator: (value) {
                    if (value == null) {
                      return 'Debe seleccionar un ${relatedClassName}';
                    }
                    return null;
                  },
                ),
                // Show message if no options available
                if (widget.${relatedEntity.label.toLowerCase()}Options.entries
                    .where((entry) => !_is${relatedClassName}AlreadyEnrolled(entry.key))
                    .isEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      border: Border.all(color: Colors.orange.shade200),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.info, color: Colors.orange),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Todos los ${relatedEntity.label.toLowerCase()}s ya están relacionados con este ${mainEntity.label.toLowerCase()}',
                            style: TextStyle(color: Colors.orange),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 16),
${formFields}
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: (_isSaving || widget.${relatedEntity.label.toLowerCase()}Options.entries
              .where((entry) => !_is${relatedClassName}AlreadyEnrolled(entry.key))
              .isEmpty) ? null : _saveDetail,
          child: _isSaving 
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Text('Agregar'),
        ),
      ],
    );
  }
}
`;
}

// Genera pantalla de formulario para una clase
function generateFormScreen(cls: NodeType, nodes: NodeType[], edges: EdgeType[]): string {
  const className = capitalizeFirst(cls.label);
  const endpoint = cls.label.toLowerCase();
  const foreignKeys = getForeignKeyFields(cls, nodes, edges);
  const ownAttributes = (cls.attributes || []).filter(attr => attr.name !== 'id');
  const manyToManyRelations = getManyToManyRelations(cls, nodes, edges).filter(
    rel => rel.isMainEntity
  );

  // Generar controladores para cada campo
  const controllers = ownAttributes
    .map(attr => `  final TextEditingController _${attr.name}Controller = TextEditingController();`)
    .join('\n');

  // Generar imports adicionales para entidades asociativas
  const associativeImports = manyToManyRelations
    .map(rel => `import '${rel.associativeEntity.label.toLowerCase()}_form_dialog.dart';`)
    .join('\n');

  // Generar variables de estado para los detalles
  const detailsStateVariables = manyToManyRelations
    .map(rel => {
      const assocClassName = capitalizeFirst(rel.associativeEntity.label);
      const relatedClassName = capitalizeFirst(rel.relatedEntity.label);
      return `  List<${assocClassName}> _${rel.associativeEntity.label.toLowerCase()}Details = [];
  List<${assocClassName}> _original${assocClassName}Details = []; // Track originals
  Map<int, String> _${rel.relatedEntity.label.toLowerCase()}Options = {};
  bool _loading${relatedClassName}Options = true;`;
    })
    .join('\n');

  // Generar métodos para cargar opciones relacionadas
  const loadRelatedOptionsMethod = manyToManyRelations
    .map(rel => {
      const relatedClassName = capitalizeFirst(rel.relatedEntity.label);
      const relatedEndpoint = rel.relatedEntity.label.toLowerCase() + 's';
      const displayAttr = getDisplayAttribute(rel.relatedEntity.label, nodes);
      return `  Future<void> _load${relatedClassName}OptionsForDetails() async {
    setState(() {
      _loading${relatedClassName}Options = true;
    });
    
    try {
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${relatedEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        final Map<int, String> tempOptions = {};
        
        for (var item in jsonList) {
          final id = item['id'] as int;
          final displayValue = item['${displayAttr}']?.toString() ?? 'Sin nombre';
          tempOptions[id] = displayValue;
        }
        
        setState(() {
          _${rel.relatedEntity.label.toLowerCase()}Options = tempOptions;
          _loading${relatedClassName}Options = false;
        });
      }
    } catch (e) {
      setState(() {
        _${rel.relatedEntity.label.toLowerCase()}Options = {};
        _loading${relatedClassName}Options = false;
      });
    }
  }`;
    })
    .join('\n\n');

  // Generar métodos para gestionar detalles
  const detailsManagementMethods = manyToManyRelations
    .map(rel => {
      const assocClassName = capitalizeFirst(rel.associativeEntity.label);
      const relatedClassName = capitalizeFirst(rel.relatedEntity.label);
      return `  void _showAdd${assocClassName}Dialog() async {
    final result = await showDialog<${assocClassName}>(
      context: context,
      builder: (context) => ${assocClassName}FormDialog(
        ${cls.label.toLowerCase()}Id: widget.item?.id ?? 0,
        ${rel.relatedEntity.label.toLowerCase()}Options: _${rel.relatedEntity.label.toLowerCase()}Options,
        existingDetails: _${rel.associativeEntity.label.toLowerCase()}Details,
      ),
    );
    if (result != null) {
      setState(() {
        _${rel.associativeEntity.label.toLowerCase()}Details.add(result);
      });
    }
  }

  void _remove${assocClassName}Detail(int index) {
    setState(() {
      _${rel.associativeEntity.label.toLowerCase()}Details.removeAt(index);
    });
  }

  String _get${relatedClassName}Display(int? id) {
    if (id == null) return 'N/A';
    return _${rel.relatedEntity.label.toLowerCase()}Options[id] ?? 'No encontrado';
  }`;
    })
    .join('\n\n');

  // Generar secciones de detalles en el formulario
  const detailsSections = manyToManyRelations
    .map(rel => {
      const assocClassName = capitalizeFirst(rel.associativeEntity.label);
      const relatedClassName = capitalizeFirst(rel.relatedEntity.label);
      const ownAttrs = (rel.associativeEntity.attributes || []).filter(
        attr =>
          attr.name !== 'id' &&
          attr.name !== cls.label.toLowerCase() + 'Id' &&
          attr.name !== rel.relatedEntity.label.toLowerCase() + 'Id'
      );

      const detailRows = ownAttrs
        .map(attr => {
          const dartType = mapDartType(attr.datatype);
          if (dartType === 'DateTime') {
            return `                                    Text('${capitalizeFirst(attr.name)}: \${detail.${attr.name}.toString().substring(0, 16)}', style: const TextStyle(fontSize: 12)),`;
          } else {
            return `                                    Text('${capitalizeFirst(attr.name)}: \${detail.${attr.name}}', style: const TextStyle(fontSize: 12)),`;
          }
        })
        .join('\n');

      return `            // Sección de ${assocClassName}s
            Card(
              margin: const EdgeInsets.symmetric(vertical: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${assocClassName}s',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.deepPurple,
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: _loading${relatedClassName}Options ? null : _showAdd${assocClassName}Dialog,
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('Agregar'),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _${rel.associativeEntity.label.toLowerCase()}Details.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.symmetric(vertical: 20),
                            child: Center(
                              child: Text(
                                'No hay ${rel.associativeEntity.label.toLowerCase()}s agregados',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ),
                          )
                        : Column(
                            children: _${rel.associativeEntity.label.toLowerCase()}Details.asMap().entries.map((entry) {
                              final index = entry.key;
                              final detail = entry.value;
                              return Card(
                                margin: const EdgeInsets.symmetric(vertical: 4),
                                elevation: 1,
                                child: ListTile(
                                  title: Text(
                                    '${relatedClassName}: \${_get${relatedClassName}Display(detail.${rel.relatedEntity.label.toLowerCase()}Id)}',
                                    style: const TextStyle(fontWeight: FontWeight.w500),
                                  ),${
                                    detailRows.length > 0
                                      ? `
                                  subtitle: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const SizedBox(height: 4),
${detailRows}
                                    ],
                                  ),`
                                      : ''
                                  }
                                  trailing: IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                                    onPressed: () => _remove${assocClassName}Detail(index),
                                    tooltip: 'Eliminar',
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                  ],
                ),
              ),
            ),`;
    })
    .join('\n');

  // Generar campos del formulario
  const formFields = [
    ...ownAttributes.map(attr => {
      const dartType = mapDartType(attr.datatype);
      if (dartType === 'DateTime') {
        return `            InkWell(
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: _selected${capitalizeFirst(attr.name)}Date ?? DateTime.now(),
                  firstDate: DateTime(1900),
                  lastDate: DateTime(2100),
                );
                if (date != null) {
                  setState(() {
                    _selected${capitalizeFirst(attr.name)}Date = date;
                  });
                }
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: '${capitalizeFirst(attr.name)}',
                  border: OutlineInputBorder(),
                  suffixIcon: Icon(Icons.calendar_today),
                ),
                child: Text(
                  _selected${capitalizeFirst(attr.name)}Date != null
                      ? '\${_selected${capitalizeFirst(attr.name)}Date!.day}/\${_selected${capitalizeFirst(attr.name)}Date!.month}/\${_selected${capitalizeFirst(attr.name)}Date!.year}'
                      : 'Seleccionar fecha',
                  style: TextStyle(
                    color: _selected${capitalizeFirst(attr.name)}Date != null ? Colors.black87 : Colors.grey,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),`;
      } else {
        const inputType =
          dartType === 'int' || dartType === 'double'
            ? 'TextInputType.number'
            : 'TextInputType.text';
        return `            TextFormField(
              controller: _${attr.name}Controller,
              decoration: const InputDecoration(
                labelText: '${capitalizeFirst(attr.name)}',
                border: OutlineInputBorder(),
              ),
              keyboardType: ${inputType},
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Este campo es requerido';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),`;
      }
    }),
    ...foreignKeys.map(fk => {
      const label = capitalizeFirst(fk.fieldName.replace('Id', ''));
      return `            _loading${fk.className}Options
                ? const LinearProgressIndicator()
                : DropdownButtonFormField<int>(
                    value: _selected${fk.className}Id,
                    decoration: const InputDecoration(
                      labelText: '${label}',
                      border: OutlineInputBorder(),
                    ),
                    items: _${fk.className.toLowerCase()}Options.entries
                        .where((entry) => entry.key != 0) // Excluir la opción de error
                        .map((entry) {
                      return DropdownMenuItem<int>(
                        value: entry.key,
                        child: Text(entry.value),
                      );
                    }).toList(),
                    onChanged: (int? value) {
                      setState(() {
                        _selected${fk.className}Id = value;
                      });
                    },
                    validator: (value) {
                      // Campo opcional para claves foráneas
                      return null;
                    },
                    hint: _${fk.className.toLowerCase()}Options.isEmpty 
                        ? const Text('Cargando opciones...')
                        : _${fk.className.toLowerCase()}Options.containsKey(0)
                            ? Text(
                                _${fk.className.toLowerCase()}Options[0]!,
                                style: const TextStyle(color: Colors.red),
                              )
                            : const Text('Selecciona una opción'),
                  ),
            const SizedBox(height: 16),`;
    }),
  ].join('\n');

  return `import 'package:flutter/material.dart';
import 'dart:convert';
import '../../offline/offline_http.dart' as http;
import '../../services/${endpoint}_service.dart';
import '../../models/${endpoint}_model.dart';
import '../../config/api_config.dart';
${manyToManyRelations.map(rel => `import '../../models/${rel.associativeEntity.label.toLowerCase()}_model.dart';`).join('\n')}
${associativeImports}

class ${className}FormScreen extends StatefulWidget {
  final ${className}? item;
  
  const ${className}FormScreen({Key? key, this.item}) : super(key: key);

  @override
  State<${className}FormScreen> createState() => _${className}FormScreenState();
}

class _${className}FormScreenState extends State<${className}FormScreen> {
  final ${className}Service _service = ${className}Service();
  final _formKey = GlobalKey<FormState>();
  
${controllers}
${foreignKeys.map(fk => `  int? _selected${fk.className}Id;`).join('\n')}
${foreignKeys.map(fk => `  Map<int, String> _${fk.className.toLowerCase()}Options = {};`).join('\n')}
${foreignKeys.map(fk => `  bool _loading${fk.className}Options = true;`).join('\n')}
${ownAttributes
  .filter(attr => mapDartType(attr.datatype) === 'DateTime')
  .map(attr => `  DateTime? _selected${capitalizeFirst(attr.name)}Date;`)
  .join('\n')}
${detailsStateVariables}

  @override
  void initState() {
    super.initState();
    if (widget.item != null) {
      _loadItemData();
    }
${foreignKeys.map(fk => `    _load${fk.className}Options();`).join('\n')}
${manyToManyRelations.map(rel => `    _load${capitalizeFirst(rel.relatedEntity.label)}OptionsForDetails();`).join('\n')}
  }

${foreignKeys
  .map(fk => {
    const relatedEndpoint = fk.className.toLowerCase() + 's';
    const displayAttr = getDisplayAttribute(fk.className, nodes);
    return `  Future<void> _load${fk.className}Options() async {
    setState(() {
      _loading${fk.className}Options = true;
    });
    
    try {
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${relatedEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        final Map<int, String> tempOptions = {};
        
        for (var item in jsonList) {
          final id = item['id'] as int;
          final displayValue = item['${displayAttr}']?.toString() ?? 'Sin nombre';
          tempOptions[id] = displayValue;
        }
        
        setState(() {
          _${fk.className.toLowerCase()}Options = tempOptions;
          _loading${fk.className}Options = false;
        });
      } else {
        setState(() {
          _${fk.className.toLowerCase()}Options = {0: 'Error al cargar opciones'};
          _loading${fk.className}Options = false;
        });
      }
    } catch (e) {
      print('Error loading ${fk.className} options: \$e');
      setState(() {
        _${fk.className.toLowerCase()}Options = {0: 'Error de conexión'};
        _loading${fk.className}Options = false;
      });
    }
  }`;
  })
  .join('\n\n')}

  void _loadItemData() {
    final item = widget.item!;
${ownAttributes
  .map(attr => {
    const dartType = mapDartType(attr.datatype);
    if (dartType === 'DateTime') {
      return `    _selected${capitalizeFirst(attr.name)}Date = item.${attr.name};`;
    } else {
      return `    _${attr.name}Controller.text = item.${attr.name}.toString();`;
    }
  })
  .join('\n')}
${foreignKeys.map(fk => `    _selected${fk.className}Id = item.${fk.fieldName};`).join('\n')}
    
    // Cargar detalles existentes en modo edición
${manyToManyRelations.map(rel => `    _loadExisting${capitalizeFirst(rel.associativeEntity.label)}Details();`).join('\n')}
  }

${loadRelatedOptionsMethod}

${manyToManyRelations
  .map(rel => {
    const assocClassName = capitalizeFirst(rel.associativeEntity.label);
    const assocEndpoint = rel.associativeEntity.label.toLowerCase() + 's';
    const mainFieldName = cls.label.toLowerCase() + 'Id';
    return `  Future<void> _loadExisting${assocClassName}Details() async {
    if (widget.item == null) return;
    
    try {
      // Obtener todos los registros primero
      final response = await http.get(
        Uri.parse(ApiConfig.endpoint('${assocEndpoint}')),
        headers: ApiConfig.headers,
      ).timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final List<dynamic> jsonList = json.decode(response.body);
        // Filtrar por ${mainFieldName} en el cliente
        final filteredList = jsonList.where((json) => 
          json['${mainFieldName}'] == widget.item!.id
        ).toList();
        
        final existingDetails = filteredList
            .map((json) => ${assocClassName}.fromJson(json))
            .toList();
        
        setState(() {
          _${rel.associativeEntity.label.toLowerCase()}Details = List.from(existingDetails);
          _original${assocClassName}Details = List.from(existingDetails);
        });
      }
    } catch (e) {
      print('Error loading existing ${rel.associativeEntity.label.toLowerCase()} details: \$e');
    }
  }`;
  })
  .join('\n\n')}

${detailsManagementMethods}

  Future<void> _saveItem() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final item = ${className}(
        id: widget.item?.id ?? 0,
${ownAttributes
  .map(attr => {
    const dartType = mapDartType(attr.datatype);
    if (dartType === 'int') {
      return `        ${attr.name}: int.parse(_${attr.name}Controller.text),`;
    } else if (dartType === 'double') {
      return `        ${attr.name}: double.parse(_${attr.name}Controller.text),`;
    } else if (dartType === 'bool') {
      return `        ${attr.name}: _${attr.name}Controller.text.toLowerCase() == 'true',`;
    } else if (dartType === 'DateTime') {
      return `        ${attr.name}: _selected${capitalizeFirst(attr.name)}Date ?? DateTime.now(),`;
    } else {
      return `        ${attr.name}: _${attr.name}Controller.text,`;
    }
  })
  .join('\n')}
${foreignKeys.map(fk => `        ${fk.fieldName}: _selected${fk.className}Id,`).join('\n')}
      );

      ${className}? result;
      if (widget.item == null) {
        result = await _service.create(item);
      } else {
        result = await _service.update(item);
      }

      if (result != null) {
        ${
          manyToManyRelations.length > 0
            ? `// Guardar detalles (entidades asociativas)
        await _saveDetails(result.id);
        `
            : ''
        }
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${className} \${widget.item == null ? 'creado' : 'actualizado'} exitosamente')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al guardar')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: \$e')),
      );
    }
  }

${
  manyToManyRelations.length > 0
    ? `  Future<void> _saveDetails(int ${cls.label.toLowerCase()}Id) async {
    try {
${manyToManyRelations
  .map(rel => {
    const assocClassName = capitalizeFirst(rel.associativeEntity.label);
    const assocEndpoint = rel.associativeEntity.label.toLowerCase() + 's';
    const mainFieldName = cls.label.toLowerCase() + 'Id';
    return `      // Si estamos editando, primero eliminar los detalles existentes
      if (widget.item != null) {
        for (var originalDetail in _original${assocClassName}Details) {
          try {
            await http.delete(
              Uri.parse(ApiConfig.endpoint('${assocEndpoint}/\${originalDetail.id}')),
              headers: ApiConfig.headers,
            ).timeout(ApiConfig.timeout);
          } catch (e) {
            print('Error deleting original detail \${originalDetail.id}: \$e');
          }
        }
      }

      // Guardar todos los detalles actuales
      for (var detail in _${rel.associativeEntity.label.toLowerCase()}Details) {
        try {
          final detailToSave = ${assocClassName}(
            id: 0, // Siempre crear nuevo
            ${mainFieldName}: ${cls.label.toLowerCase()}Id,
            ${rel.relatedEntity.label.toLowerCase()}Id: detail.${rel.relatedEntity.label.toLowerCase()}Id,
${(rel.associativeEntity.attributes || [])
  .filter(
    attr =>
      attr.name !== 'id' &&
      attr.name !== mainFieldName &&
      attr.name !== rel.relatedEntity.label.toLowerCase() + 'Id'
  )
  .map(attr => `            ${attr.name}: detail.${attr.name},`)
  .join('\n')}
          );
          
          await http.post(
            Uri.parse(ApiConfig.endpoint('${assocEndpoint}')),
            headers: ApiConfig.headers,
            body: json.encode(detailToSave.toJson()),
          ).timeout(ApiConfig.timeout);
        } catch (e) {
          print('Error saving ${rel.associativeEntity.label.toLowerCase()} detail: \$e');
        }
      }`;
  })
  .join('\n')}
    } catch (e) {
      print('Error in _saveDetails: \$e');
    }
  }`
    : ''
}

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('\${widget.item == null ? 'Crear' : 'Editar'} ${className}'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
${formFields}
${detailsSections}
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _saveItem,
                      child: const Text('Guardar'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
${ownAttributes.map(attr => `    _${attr.name}Controller.dispose();`).join('\n')}
    super.dispose();
  }
}
`;
}

// Genera el drawer de navegación
function generateAppDrawer(classes: NodeType[]): string {
  const drawerItems = classes
    .map(cls => {
      const route = `/${cls.label.toLowerCase()}`;
      return `          ListTile(
            leading: const Icon(Icons.table_chart),
            title: Text('${capitalizeFirst(cls.label)}s'),
            onTap: () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '${route}');
            },
          ),`;
    })
    .join('\n');

  return `import 'package:flutter/material.dart';
import 'server_config_dialog.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          const DrawerHeader(
            decoration: BoxDecoration(
              color: Colors.deepPurple,
            ),
            child: Text(
              'Sistema CRUD',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.home),
            title: const Text('Inicio'),
            onTap: () {
              Navigator.pop(context);
              Navigator.pushReplacementNamed(context, '/');
            },
          ),
          const Divider(),
${drawerItems}
          const Divider(),
          ListTile(
            leading: const Icon(Icons.settings_ethernet),
            title: const Text('Servidor'),
            subtitle: const Text('Dirección del backend'),
            onTap: () {
              Navigator.pop(context);
              ServerConfigDialog.show(context);
            },
          ),
        ],
      ),
    );
  }
}
`;
}

// Función auxiliar - no se usa pero la mantenemos para compatibilidad
function generateSidebar(classes: NodeType[]): string {
  return generateAppDrawer(classes);
}

// Genera archivo de configuración centralizada de API
function generateApiConfig(): string {
  return `import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

/// Configuración centralizada de la API (backend Spring Boot).
///
/// La dirección del servidor se puede cambiar DESDE LA APP (menú > Servidor)
/// y queda guardada en el dispositivo. Así no hace falta recompilar cuando
/// cambia la red (casa, universidad, etc.).
///
/// Orden de prioridad:
///   1. La dirección guardada desde la pantalla "Servidor".
///   2. --dart-define=API_URL=http://IP:8080 al compilar.
///   3. Navegador: el mismo equipo desde donde se abrió la app (puerto 8080).
///      Android: 10.0.2.2:8080 (el PC visto desde el emulador).
class ApiConfig {
  static const String _prefsKey = 'api_base_url';
  static const String _defineUrl = String.fromEnvironment('API_URL');

  static String _baseUrl = defaultUrl;

  static String get baseUrl => _baseUrl;

  static String get defaultUrl {
    if (_defineUrl.isNotEmpty) return _defineUrl;
    if (kIsWeb) {
      final host = Uri.base.host.isEmpty ? 'localhost' : Uri.base.host;
      return 'http://$host:8080';
    }
    return 'http://10.0.2.2:8080';
  }

  /// Carga la dirección guardada (llamar una vez al iniciar la app).
  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _baseUrl = prefs.getString(_prefsKey) ?? defaultUrl;
    } catch (_) {
      _baseUrl = defaultUrl;
    }
  }

  /// Guarda una nueva dirección (ej. http://192.168.1.20:8080).
  static Future<void> save(String url) async {
    var clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://$clean';
    }
    while (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    _baseUrl = clean;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, clean);
  }

  // Headers comunes para todas las peticiones
  static const Map<String, String> headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Timeout para las peticiones
  static const Duration timeout = Duration(seconds: 15);

  // Construye la URL completa de un recurso
  static String endpoint(String path) => '$_baseUrl/$path';

  // Verificación de conexión: la documentación OpenAPI del backend siempre responde 200
  static String healthCheck() => '$_baseUrl/v3/api-docs';

  static String swaggerUI() => '$_baseUrl/swagger-ui/index.html';
}
`;
}

// Diálogo para cambiar la dirección del backend desde la app
function generateServerConfigDialog(): string {
  return `import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

/// Diálogo para cambiar la dirección del backend desde la app.
/// En el celular: escribe la IP del PC donde corre Spring Boot (ej. 192.168.1.20:8080).
class ServerConfigDialog extends StatefulWidget {
  const ServerConfigDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog(context: context, builder: (_) => const ServerConfigDialog());
  }

  @override
  State<ServerConfigDialog> createState() => _ServerConfigDialogState();
}

class _ServerConfigDialogState extends State<ServerConfigDialog> {
  late final TextEditingController _controller;
  String? _status;
  bool _ok = false;
  bool _testing = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: ApiConfig.baseUrl);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _normalized() {
    var url = _controller.text.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://$url';
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }

  Future<void> _test() async {
    setState(() {
      _testing = true;
      _status = null;
    });
    try {
      // Cualquier respuesta HTTP (aunque sea 404) significa que el servidor existe
      final res = await http.get(Uri.parse(_normalized())).timeout(const Duration(seconds: 6));
      setState(() {
        _ok = true;
        _status = '✅ Conectado (respuesta \${res.statusCode})';
      });
    } catch (e) {
      setState(() {
        _ok = false;
        _status = '❌ No responde. Revisa la IP, que el backend esté corriendo '
            'y que el celular esté en el mismo wifi.';
      });
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _save() async {
    await ApiConfig.save(_controller.text);
    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Servidor guardado: \${ApiConfig.baseUrl}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('⚙️ Servidor (backend)'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Dirección del backend Spring Boot.\\n'
            'En el celular usa la IP del PC, por ejemplo:\\nhttp://192.168.1.20:8080',
            style: TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'URL del servidor',
            ),
          ),
          if (_status != null) ...[
            const SizedBox(height: 10),
            Text(_status!, style: TextStyle(color: _ok ? Colors.green[700] : Colors.red[700])),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () async {
            _controller.text = ApiConfig.defaultUrl;
          },
          child: const Text('Por defecto'),
        ),
        TextButton(
          onPressed: _testing ? null : _test,
          child: Text(_testing ? 'Probando…' : 'Probar'),
        ),
        FilledButton(onPressed: _save, child: const Text('Guardar')),
      ],
    );
  }
}
`;
}

// AndroidManifest con permiso de internet y http:// permitido (flutter create no lo sobrescribe)
function generateAndroidManifest(): string {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Acceso a internet/red local y conexiones http:// al backend en el PC -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:label="CRUD UML"
        android:usesCleartextTraffic="true"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:taskAffinity=""
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <!-- Specifies an Android theme to apply to this Activity as soon as
                 the Android process has started. This theme is visible to the user
                 while the Flutter UI initializes. After that, this theme continues
                 to determine the Window background behind the Flutter UI. -->
            <meta-data
              android:name="io.flutter.embedding.android.NormalTheme"
              android:resource="@style/NormalTheme"
              />
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <!-- Don't delete the meta-data below.
             This is used by the Flutter tool to generate GeneratedPluginRegistrant.java -->
        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
    <!-- Required to query activities that can process text, see:
         https://developer.android.com/training/package-visibility and
         https://developer.android.com/reference/android/content/Intent#ACTION_PROCESS_TEXT.

         In particular, this is used by the Flutter engine in io.flutter.plugin.text.ProcessTextPlugin. -->
    <queries>
        <intent>
            <action android:name="android.intent.action.PROCESS_TEXT"/>
            <data android:mimeType="text/plain"/>
        </intent>
    </queries>
</manifest>
`;
}

// ---- Modo sin conexión (SQLite + cola de sincronización), probado en Android ----
function generateLocalStore(): string {
  return `import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

/// Operación pendiente de enviar al backend (cola de sincronización).
class PendingOp {
  final int seq; // orden en que se hizo
  final String entity; // endpoint, ej. 'clientes'
  final String op; // 'create' | 'update' | 'delete'
  final int itemId; // id del registro (negativo = creado sin conexión)
  final Map<String, dynamic>? data;

  PendingOp(this.seq, this.entity, this.op, this.itemId, this.data);

  Map<String, dynamic> toMap() =>
      {'seq': seq, 'entity': entity, 'op': op, 'item_id': itemId, 'data': data == null ? null : jsonEncode(data)};

  static PendingOp fromMap(Map<String, dynamic> m) => PendingOp(
        (m['seq'] as num).toInt(),
        m['entity'] as String,
        m['op'] as String,
        (m['item_id'] as num).toInt(),
        m['data'] == null ? null : Map<String, dynamic>.from(jsonDecode(m['data'] as String) as Map),
      );
}

/// Almacenamiento local del modo sin conexión.
///
/// - Android / iOS: base de datos **SQLite** (\`crud_offline.db\`) con dos tablas:
///     cache(entity, id, data)                      -> copia local de cada lista
///     pending_ops(seq, entity, op, item_id, data)  -> cambios hechos sin conexión
/// - Web (navegador): las mismas dos estructuras guardadas en shared_preferences.
class LocalStore {
  LocalStore._();

  static Database? _db;
  static SharedPreferences? _prefs;
  static int _lastTempId = 0;

  static Future<void> init() async {
    if (kIsWeb) {
      _prefs = await SharedPreferences.getInstance();
      return;
    }
    final path = p.join(await getDatabasesPath(), 'crud_offline.db');
    _db = await openDatabase(path, version: 1, onCreate: (db, version) async {
      await db.execute(
          'CREATE TABLE cache (entity TEXT NOT NULL, id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (entity, id))');
      await db.execute('CREATE TABLE pending_ops (seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, '
          'op TEXT NOT NULL, item_id INTEGER NOT NULL, data TEXT)');
    });
  }

  /// Id temporal (negativo y único) para registros creados sin conexión.
  static int nextTempId() {
    var id = -DateTime.now().millisecondsSinceEpoch;
    if (id >= _lastTempId) id = _lastTempId - 1;
    _lastTempId = id;
    return id;
  }

  // ---------------------------------------------------------------- web (shared_preferences)
  static Map<String, Map<String, dynamic>> _webCache(String entity) {
    final raw = _prefs!.getString('offline_cache_$entity');
    if (raw == null) return {};
    return (jsonDecode(raw) as Map).map((k, v) => MapEntry(k as String, Map<String, dynamic>.from(v as Map)));
  }

  static Future<void> _saveWebCache(String entity, Map<String, Map<String, dynamic>> m) =>
      _prefs!.setString('offline_cache_$entity', jsonEncode(m));

  static List<Map<String, dynamic>> _webOps() {
    final raw = _prefs!.getString('offline_pending_ops');
    if (raw == null) return [];
    return (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static Future<void> _saveWebOps(List<Map<String, dynamic>> ops) =>
      _prefs!.setString('offline_pending_ops', jsonEncode(ops));

  // ---------------------------------------------------------------- caché de listas
  static Future<List<Map<String, dynamic>>> readAll(String entity) async {
    if (kIsWeb) return _webCache(entity).values.toList();
    final rows = await _db!.query('cache', where: 'entity = ?', whereArgs: [entity], orderBy: 'id');
    final items = rows.map((r) => Map<String, dynamic>.from(jsonDecode(r['data'] as String) as Map)).toList();
    // Los creados sin conexión (id negativo) al final
    items.sort((a, b) {
      final ia = (a['id'] as num?)?.toInt() ?? 0, ib = (b['id'] as num?)?.toInt() ?? 0;
      if ((ia < 0) != (ib < 0)) return ia < 0 ? 1 : -1;
      return ia.compareTo(ib);
    });
    return items;
  }

  static Future<Map<String, dynamic>?> read(String entity, int id) async {
    if (kIsWeb) return _webCache(entity)['$id'];
    final rows = await _db!.query('cache', where: 'entity = ? AND id = ?', whereArgs: [entity, id]);
    return rows.isEmpty ? null : Map<String, dynamic>.from(jsonDecode(rows.first['data'] as String) as Map);
  }

  static Future<void> upsert(String entity, Map<String, dynamic> item) async {
    final id = (item['id'] as num).toInt();
    if (kIsWeb) {
      final m = _webCache(entity)..['$id'] = item;
      return _saveWebCache(entity, m);
    }
    await _db!.insert('cache', {'entity': entity, 'id': id, 'data': jsonEncode(item)},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<void> remove(String entity, int id) async {
    if (kIsWeb) {
      final m = _webCache(entity)..remove('$id');
      return _saveWebCache(entity, m);
    }
    await _db!.delete('cache', where: 'entity = ? AND id = ?', whereArgs: [entity, id]);
  }

  /// Reemplaza la copia local con la lista del servidor, sin pisar los registros
  /// que todavía tienen cambios pendientes (creados, editados o borrados sin conexión).
  static Future<void> replaceAll(String entity, List<Map<String, dynamic>> serverItems) async {
    final pendingIds = (await listOps()).where((o) => o.entity == entity).map((o) => o.itemId).toSet();
    final keep = (await readAll(entity)).where((i) => pendingIds.contains((i['id'] as num).toInt())).toList();
    final fresh = serverItems.where((i) => !pendingIds.contains((i['id'] as num?)?.toInt())).toList();
    if (kIsWeb) {
      final m = <String, Map<String, dynamic>>{};
      for (final i in [...fresh, ...keep]) {
        m['\${(i['id'] as num).toInt()}'] = i;
      }
      return _saveWebCache(entity, m);
    }
    await _db!.transaction((txn) async {
      await txn.delete('cache', where: 'entity = ?', whereArgs: [entity]);
      for (final i in [...fresh, ...keep]) {
        await txn.insert('cache', {'entity': entity, 'id': (i['id'] as num).toInt(), 'data': jsonEncode(i)},
            conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  // ---------------------------------------------------------------- cola de pendientes
  static Future<List<PendingOp>> listOps() async {
    if (kIsWeb) return _webOps().map(PendingOp.fromMap).toList();
    final rows = await _db!.query('pending_ops', orderBy: 'seq');
    return rows.map((r) => PendingOp.fromMap(Map<String, dynamic>.from(r))).toList();
  }

  static Future<int> countOps() async => (await listOps()).length;

  static Future<void> addOp(String entity, String op, int itemId, Map<String, dynamic>? data) async {
    if (kIsWeb) {
      final ops = _webOps();
      final seq = ops.isEmpty ? 1 : (ops.last['seq'] as num).toInt() + 1;
      ops.add(PendingOp(seq, entity, op, itemId, data).toMap());
      return _saveWebOps(ops);
    }
    await _db!.insert('pending_ops',
        {'entity': entity, 'op': op, 'item_id': itemId, 'data': data == null ? null : jsonEncode(data)});
  }

  static Future<void> removeOp(int seq) async {
    if (kIsWeb) return _saveWebOps(_webOps()..removeWhere((o) => (o['seq'] as num).toInt() == seq));
    await _db!.delete('pending_ops', where: 'seq = ?', whereArgs: [seq]);
  }

  /// Borra todas las operaciones pendientes de un registro (p. ej. se creó y se borró sin conexión).
  static Future<void> removeOpsOf(String entity, int itemId) async {
    for (final o in await listOps()) {
      if (o.entity == entity && o.itemId == itemId) await removeOp(o.seq);
    }
  }

  /// Si el registro aún no se envió (id negativo), se actualizan los datos de su "create" pendiente.
  static Future<bool> updatePendingCreate(String entity, int itemId, Map<String, dynamic> data) async {
    for (final o in await listOps()) {
      if (o.entity == entity && o.itemId == itemId && o.op == 'create') {
        await _replaceOpData(o.seq, data);
        return true;
      }
    }
    return false;
  }

  static Future<void> _replaceOpData(int seq, Map<String, dynamic>? data) async {
    if (kIsWeb) {
      final ops = _webOps();
      for (final o in ops) {
        if ((o['seq'] as num).toInt() == seq) o['data'] = data == null ? null : jsonEncode(data);
      }
      return _saveWebOps(ops);
    }
    await _db!.update('pending_ops', {'data': data == null ? null : jsonEncode(data)},
        where: 'seq = ?', whereArgs: [seq]);
  }

  /// Cuando el backend asigna el id real a un registro creado sin conexión:
  /// - cambia el id en la copia local y en sus operaciones pendientes, y
  /// - corrige las claves foráneas (campos "...Id") que apuntaban al id temporal
  ///   (ej. una Factura creada sin conexión para un Cliente también nuevo).
  static Future<void> remapId(String entity, int oldId, Map<String, dynamic> saved) async {
    final newId = (saved['id'] as num).toInt();
    await remove(entity, oldId);
    await upsert(entity, saved);

    Map<String, dynamic>? fix(Map<String, dynamic>? d) {
      if (d == null) return null;
      var changed = false;
      final out = Map<String, dynamic>.from(d);
      out.forEach((k, v) {
        if (k != 'id' && k.endsWith('Id') && v is num && v.toInt() == oldId) {
          out[k] = newId;
          changed = true;
        }
      });
      return changed ? out : null;
    }

    for (final o in await listOps()) {
      final fixed = fix(o.data);
      if (fixed != null) await _replaceOpData(o.seq, fixed);
      if (o.entity == entity && o.itemId == oldId) {
        if (kIsWeb) {
          final ops = _webOps();
          for (final w in ops) {
            if ((w['seq'] as num).toInt() == o.seq) w['item_id'] = newId;
          }
          await _saveWebOps(ops);
        } else {
          await _db!.update('pending_ops', {'item_id': newId}, where: 'seq = ?', whereArgs: [o.seq]);
        }
      }
    }
    // Claves foráneas en la copia local de las demás listas
    final entities = kIsWeb
        ? _prefs!.getKeys().where((k) => k.startsWith('offline_cache_')).map((k) => k.substring(14)).toList()
        : (await _db!.rawQuery('SELECT DISTINCT entity FROM cache')).map((r) => r['entity'] as String).toList();
    for (final e in entities) {
      for (final item in await readAll(e)) {
        final fixed = fix(item);
        if (fixed != null) await upsert(e, fixed);
      }
    }
  }
}
`;
}

function generateSyncService(): string {
  return `import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'local_store.dart';
import 'offline_http.dart' show prefetchAll;

/// Estado visible del modo sin conexión (lo muestra el aviso superior de la app).
class SyncState {
  final bool online;
  final int pending;
  final bool syncing;
  final String? message;
  const SyncState({this.online = true, this.pending = 0, this.syncing = false, this.message});

  SyncState copyWith({bool? online, int? pending, bool? syncing, String? message}) => SyncState(
        online: online ?? this.online,
        pending: pending ?? this.pending,
        syncing: syncing ?? this.syncing,
        message: message,
      );
}

/// Envía al backend, en orden, los cambios hechos sin conexión.
/// Se ejecuta al abrir la app, cada 20 s mientras haya pendientes y con el botón "Sincronizar".
class SyncService {
  SyncService._();
  static final SyncService instance = SyncService._();

  final ValueNotifier<SyncState> state = ValueNotifier(const SyncState());
  Timer? _timer;
  bool _running = false;
  bool _prefetching = false;
  List<String> _entities = const [];

  bool get hasPending => state.value.pending > 0;

  /// [entities]: recursos de la API que se descargan para tenerlos disponibles sin conexión.
  Future<void> init({List<String> entities = const []}) async {
    _entities = entities;
    await LocalStore.init();
    await refreshCount();
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => _tick());
    unawaited(syncNow().then((_) => prefetch()));
  }

  /// Cada 20 s: si hay pendientes intenta enviarlos; si estaba sin conexión, comprueba si volvió.
  Future<void> _tick() async {
    if (_running) return;
    if (hasPending) {
      await syncNow();
    } else if (!state.value.online) {
      try {
        final r = await http.get(Uri.parse(ApiConfig.healthCheck())).timeout(const Duration(seconds: 5));
        if (r.statusCode < 500) markOnline();
      } catch (_) {
        // sigue sin conexión
      }
    }
  }

  /// Descarga todas las listas (copia local completa para trabajar sin conexión).
  Future<void> prefetch() async {
    if (_prefetching || _entities.isEmpty) return;
    _prefetching = true;
    try {
      await prefetchAll(_entities);
    } finally {
      _prefetching = false;
    }
  }

  Future<void> refreshCount() async {
    state.value = state.value.copyWith(pending: await LocalStore.countOps(), message: state.value.message);
  }

  void markOnline() {
    if (state.value.online) return;
    state.value = state.value.copyWith(online: true);
    // Volvió la conexión: enviar pendientes y refrescar la copia local
    unawaited(syncNow().then((_) => prefetch()));
  }

  void markOffline() {
    if (state.value.online) state.value = state.value.copyWith(online: false);
  }

  Uri _uri(String entity, [int? id]) => Uri.parse(ApiConfig.endpoint(id == null ? entity : '$entity/$id'));

  /// Devuelve cuántas operaciones se enviaron. Se detiene en cuanto detecta que sigue sin conexión.
  Future<int> syncNow() async {
    if (_running) return 0;
    _running = true;
    state.value = state.value.copyWith(syncing: true);
    var sent = 0;
    final rejected = <String>[];
    try {
      for (final op in await LocalStore.listOps()) {
        http.Response r;
        try {
          switch (op.op) {
            case 'create':
              final body = Map<String, dynamic>.from(op.data ?? {})..['id'] = null;
              r = await http
                  .post(_uri(op.entity), headers: ApiConfig.headers, body: jsonEncode(body))
                  .timeout(ApiConfig.timeout);
              break;
            case 'update':
              final body = Map<String, dynamic>.from(op.data ?? {})..['id'] = op.itemId;
              r = await http
                  .put(_uri(op.entity, op.itemId), headers: ApiConfig.headers, body: jsonEncode(body))
                  .timeout(ApiConfig.timeout);
              break;
            default:
              r = await http.delete(_uri(op.entity, op.itemId), headers: ApiConfig.headers).timeout(ApiConfig.timeout);
          }
        } catch (_) {
          markOffline(); // sigue sin conexión: se reintenta más tarde, en el mismo orden
          break;
        }
        markOnline();
        final ok = r.statusCode >= 200 && r.statusCode < 300 || (op.op == 'delete' && r.statusCode == 404);
        if (ok) {
          if (op.op == 'create' && r.body.isNotEmpty) {
            await LocalStore.remapId(op.entity, op.itemId, Map<String, dynamic>.from(jsonDecode(r.body) as Map));
          }
          await LocalStore.removeOp(op.seq);
          sent++;
        } else {
          // El servidor rechazó el cambio (ej. 409: la clave foránea ya no existe). Se descarta y se avisa.
          rejected.add('\${op.op} \${op.entity} (\${r.statusCode})');
          if (op.op == 'create') await LocalStore.remove(op.entity, op.itemId);
          await LocalStore.removeOp(op.seq);
        }
      }
    } finally {
      _running = false;
      final pending = await LocalStore.countOps();
      state.value = state.value.copyWith(
        syncing: false,
        pending: pending,
        message: rejected.isNotEmpty
            ? 'El servidor rechazó: \${rejected.join(', ')}'
            : (sent > 0 ? '✅ $sent cambio(s) sincronizados' : null),
      );
    }
    return sent;
  }
}
`;
}

function generateOfflineRepository(): string {
  return `import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'local_store.dart';
import 'sync_service.dart';

/// CRUD genérico con soporte sin conexión, usado por todos los servicios.
///
/// - Con conexión: habla con el backend y guarda una copia local de lo recibido.
/// - Sin conexión (no responde el servidor): lee la copia local y guarda los cambios
///   en la cola de pendientes; SyncService los envía cuando vuelve la conexión.
/// - Si el servidor responde con error (400, 404, 409...) NO se toma como "sin conexión":
///   se devuelve null/false para que la pantalla muestre el error.
class OfflineRepository {
  OfflineRepository(this.entity);

  /// Ruta del recurso en la API, ej. 'clientes'
  final String entity;

  SyncService get _sync => SyncService.instance;

  Uri _uri([int? id]) => Uri.parse(ApiConfig.endpoint(id == null ? entity : '$entity/$id'));

  Future<List<Map<String, dynamic>>> getAll() async {
    if (_sync.hasPending) await _sync.syncNow();
    try {
      final r = await http.get(_uri(), headers: ApiConfig.headers).timeout(ApiConfig.timeout);
      _sync.markOnline();
      if (r.statusCode == 200) {
        final list = (jsonDecode(r.body) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        await LocalStore.replaceAll(entity, list);
      }
    } catch (_) {
      _sync.markOffline();
    }
    return LocalStore.readAll(entity);
  }

  Future<Map<String, dynamic>?> getById(int id) async {
    if (id > 0) {
      try {
        final r = await http.get(_uri(id), headers: ApiConfig.headers).timeout(ApiConfig.timeout);
        _sync.markOnline();
        if (r.statusCode == 200) {
          final item = Map<String, dynamic>.from(jsonDecode(r.body) as Map);
          await LocalStore.upsert(entity, item);
          return item;
        }
      } catch (_) {
        _sync.markOffline();
      }
    }
    return LocalStore.read(entity, id);
  }

  Future<Map<String, dynamic>?> create(Map<String, dynamic> data) async {
    final body = Map<String, dynamic>.from(data)..['id'] = null;
    try {
      final r = await http
          .post(_uri(), headers: ApiConfig.headers, body: jsonEncode(body))
          .timeout(ApiConfig.timeout);
      _sync.markOnline();
      if (r.statusCode == 201 || r.statusCode == 200) {
        final saved = Map<String, dynamic>.from(jsonDecode(r.body) as Map);
        await LocalStore.upsert(entity, saved);
        return saved;
      }
      return null; // rechazado por el servidor (validación o clave foránea inexistente)
    } catch (_) {
      // Sin conexión: se guarda en el celular con un id temporal negativo
      _sync.markOffline();
      final local = Map<String, dynamic>.from(data)..['id'] = LocalStore.nextTempId();
      await LocalStore.upsert(entity, local);
      await LocalStore.addOp(entity, 'create', local['id'] as int, local);
      await _sync.refreshCount();
      return local;
    }
  }

  Future<Map<String, dynamic>?> update(int id, Map<String, dynamic> data) async {
    final item = Map<String, dynamic>.from(data)..['id'] = id;
    if (id < 0) {
      // Todavía no existe en el servidor: se corrige su "create" pendiente
      await LocalStore.upsert(entity, item);
      await LocalStore.updatePendingCreate(entity, id, item);
      return item;
    }
    try {
      final r = await http
          .put(_uri(id), headers: ApiConfig.headers, body: jsonEncode(item))
          .timeout(ApiConfig.timeout);
      _sync.markOnline();
      if (r.statusCode == 200) {
        final saved = Map<String, dynamic>.from(jsonDecode(r.body) as Map);
        await LocalStore.upsert(entity, saved);
        return saved;
      }
      return null;
    } catch (_) {
      _sync.markOffline();
      await LocalStore.upsert(entity, item);
      await LocalStore.addOp(entity, 'update', id, item);
      await _sync.refreshCount();
      return item;
    }
  }

  Future<bool> delete(int id) async {
    if (id < 0) {
      // Se creó y se borra sin haber llegado al servidor: basta con olvidarlo
      await LocalStore.remove(entity, id);
      await LocalStore.removeOpsOf(entity, id);
      await _sync.refreshCount();
      return true;
    }
    try {
      final r = await http.delete(_uri(id), headers: ApiConfig.headers).timeout(ApiConfig.timeout);
      _sync.markOnline();
      if (r.statusCode == 200 || r.statusCode == 204 || r.statusCode == 404) {
        await LocalStore.remove(entity, id);
        return true;
      }
      return false;
    } catch (_) {
      _sync.markOffline();
      await LocalStore.remove(entity, id);
      await LocalStore.addOp(entity, 'delete', id, null);
      await _sync.refreshCount();
      return true;
    }
  }

  Future<bool> checkConnection() async {
    try {
      final r = await http
          .get(Uri.parse(ApiConfig.healthCheck()), headers: ApiConfig.headers)
          .timeout(const Duration(seconds: 5));
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
`;
}

function generateOfflineHttp(): string {
  return `import 'dart:convert';
import 'package:http/http.dart' as real;
import '../config/api_config.dart';
import 'offline_repository.dart';

export 'package:http/http.dart' show Response;

/// Reemplazo de \`package:http\` para las pantallas: mismas funciones (get, post, put, delete),
/// pero cada llamada a la API pasa por OfflineRepository (copia local + cola de pendientes).
/// Así formularios, listas de selección y detalles también funcionan sin conexión.
///
/// Uso en las pantallas:  import '../../offline/offline_http.dart' as http;

final Map<String, OfflineRepository> _repos = {};

/// Separa una URL de la API en (recurso, id). Ej: http://x:8080/facturas/3 -> ('facturas', 3)
({String entity, int? id})? _route(Uri url) {
  final base = ApiConfig.baseUrl.endsWith('/') ? ApiConfig.baseUrl : '\${ApiConfig.baseUrl}/';
  final full = url.replace(query: '').toString().replaceAll(RegExp(r'\\?$'), '');
  if (!full.startsWith(base)) return null;
  final parts = full.substring(base.length).split('/').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty || parts.length > 2) return null;
  final id = parts.length == 2 ? int.tryParse(parts[1]) : null;
  if (parts.length == 2 && id == null) return null;
  return (entity: parts[0], id: id);
}

OfflineRepository _repo(String entity) => _repos.putIfAbsent(entity, () => OfflineRepository(entity));

real.Response _json(Object? body, int status) => real.Response.bytes(
      utf8.encode(body == null ? '' : jsonEncode(body)),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

Future<real.Response> get(Uri url, {Map<String, String>? headers}) async {
  final r = _route(url);
  if (r == null) return real.get(url, headers: headers);
  if (r.id == null) return _json(await _repo(r.entity).getAll(), 200);
  final item = await _repo(r.entity).getById(r.id!);
  return item == null ? _json({'error': 'No encontrado'}, 404) : _json(item, 200);
}

Future<real.Response> post(Uri url, {Map<String, String>? headers, Object? body, Encoding? encoding}) async {
  final r = _route(url);
  if (r == null || r.id != null) return real.post(url, headers: headers, body: body, encoding: encoding);
  final saved = await _repo(r.entity).create(Map<String, dynamic>.from(jsonDecode(body as String) as Map));
  return saved == null ? _json({'error': 'El servidor rechazó el registro'}, 409) : _json(saved, 201);
}

Future<real.Response> put(Uri url, {Map<String, String>? headers, Object? body, Encoding? encoding}) async {
  final r = _route(url);
  if (r == null || r.id == null) return real.put(url, headers: headers, body: body, encoding: encoding);
  final saved =
      await _repo(r.entity).update(r.id!, Map<String, dynamic>.from(jsonDecode(body as String) as Map));
  return saved == null ? _json({'error': 'El servidor rechazó el cambio'}, 409) : _json(saved, 200);
}

Future<real.Response> delete(Uri url, {Map<String, String>? headers, Object? body, Encoding? encoding}) async {
  final r = _route(url);
  if (r == null || r.id == null) return real.delete(url, headers: headers, body: body, encoding: encoding);
  return await _repo(r.entity).delete(r.id!) ? _json(null, 204) : _json({'error': 'No se pudo eliminar'}, 409);
}

/// Descarga todas las listas para tenerlas disponibles sin conexión
/// (se llama al abrir la app y cada vez que vuelve la conexión).
Future<void> prefetchAll(List<String> entities) async {
  for (final e in entities) {
    await _repo(e).getAll();
  }
}
`;
}

function generateSyncBanner(): string {
  return `import 'package:flutter/material.dart';
import '../offline/sync_service.dart';

/// Aviso superior, visible en todas las pantallas:
/// - Sin conexión: los cambios se guardan en el celular.
/// - Con cambios pendientes: botón para sincronizar ahora.
class SyncBanner extends StatelessWidget {
  const SyncBanner({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final sync = SyncService.instance;
    return ValueListenableBuilder<SyncState>(
      valueListenable: sync.state,
      builder: (context, s, _) {
        if (s.online && s.pending == 0 && s.message == null) return const SizedBox.shrink();

        final Color color;
        final IconData icon;
        final String text;
        if (s.syncing) {
          color = Colors.blue.shade700;
          icon = Icons.sync;
          text = 'Sincronizando \${s.pending} cambio(s)…';
        } else if (!s.online) {
          color = Colors.orange.shade800;
          icon = Icons.cloud_off;
          text = s.pending > 0
              ? 'Sin conexión · \${s.pending} cambio(s) guardados en el dispositivo'
              : 'Sin conexión · mostrando los últimos datos guardados';
        } else if (s.pending > 0) {
          color = Colors.blue.shade700;
          icon = Icons.cloud_upload;
          text = '\${s.pending} cambio(s) pendientes de enviar';
        } else {
          color = s.message!.startsWith('✅') ? Colors.green.shade700 : Colors.red.shade700;
          icon = s.message!.startsWith('✅') ? Icons.cloud_done : Icons.error_outline;
          text = s.message!;
        }

        return Material(
          color: color,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Row(
                children: [
                  Icon(icon, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 13)),
                  ),
                  if (s.pending > 0 && !s.syncing)
                    TextButton(
                      onPressed: () => sync.syncNow(),
                      child: const Text('Sincronizar', style: TextStyle(color: Colors.white)),
                    ),
                  if (s.pending == 0 && s.online && s.message != null)
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 18),
                      onPressed: () => sync.state.value = s.copyWith(message: null),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
`;
}

// Memoria de Gradle acotada para PCs de 8 GB (flutter create no sobrescribe este archivo)
function generateGradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m -XX:ReservedCodeCacheSize=256m
org.gradle.daemon=false
kotlin.compiler.execution.strategy=in-process
android.useAndroidX=true
# This newDsl flag was added by the Flutter template
android.newDsl=false
# This builtInKotlin flag was added by the Flutter template
android.builtInKotlin=false
`;
}

// Genera analysis_options.yaml
function generateAnalysisOptions(): string {
  return `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: false
    prefer_const_literals_to_create_immutables: false
    avoid_print: false
`;
}

// Genera README.md
function generateReadme(): string {
  return `# App Flutter CRUD (generada desde el diagrama UML)

App móvil/web con pantallas para crear, ver, editar y eliminar cada entidad del diagrama.
Consume la API REST del backend Spring Boot generado por el mismo sistema.

## Requisitos
- Flutter 3.10 o superior
- El backend Spring Boot corriendo (puerto 8080)

## Primera vez
\`\`\`bash
flutter create . --platforms android,web   # agrega las carpetas de Android y Web
flutter pub get
\`\`\`

## Ejecutar en el navegador (Chrome / Edge)
\`\`\`bash
flutter run -d chrome
\`\`\`
La app usa automáticamente el backend del mismo equipo: \`http://localhost:8080\`.

## Ejecutar en un celular Android (cable USB)
1. En el celular: activar **Opciones de desarrollador** y **Depuración USB**.
2. Conectar el cable y aceptar el aviso "¿Permitir depuración USB?".
3. \`flutter devices\` debe mostrar el celular.
4. \`flutter run\`
5. En la app: **menú ☰ → Servidor** → escribir la IP del PC, por ejemplo \`http://192.168.1.20:8080\`
   → **Probar** → **Guardar**. Queda guardada en el celular.

El celular y el PC deben estar en la **misma red wifi**. La IP del PC se ve con \`ipconfig\`
(Windows, "Dirección IPv4"). Si no conecta, permitir Java en el **Firewall de Windows** (redes privadas).

## Modo sin conexión
La app sigue funcionando si el backend o la red no están disponibles:
- Cada lista se guarda en una base **SQLite** del celular (en el navegador, en el almacenamiento local).
- Sin conexión se puede **ver, crear, editar y eliminar**; los cambios quedan en una **cola de pendientes**.
- Arriba aparece el aviso **"Sin conexión · N cambios guardados"**. Al volver la conexión se envían
  solos (cada 20 s) o con el botón **Sincronizar**, en el mismo orden en que se hicieron.
- Lo creado sin conexión usa un id temporal negativo; al sincronizar se reemplaza por el id real
  y se corrigen las claves foráneas que lo usaban (ej. una factura de un cliente también nuevo).
- Si el servidor rechaza un cambio (ej. 409 por una clave foránea inexistente) se descarta y se avisa.

Código en \`lib/offline/\` (local_store, sync_service, offline_repository) y \`lib/widgets/sync_banner.dart\`.

## Configuración de la API
Todo está en \`lib/config/api_config.dart\`. Prioridad:
1. La dirección guardada desde la pantalla **Servidor** de la app.
2. \`flutter run --dart-define=API_URL=http://IP:8080\`
3. Navegador: el mismo equipo (puerto 8080). Emulador Android: \`http://10.0.2.2:8080\`.

## Estructura
\`\`\`
lib/
├── main.dart
├── config/api_config.dart        # dirección del backend
├── models/                       # un modelo por entidad
├── services/                     # llamadas HTTP (GET, POST, PUT, DELETE)
├── screens/                      # pantallas CRUD por entidad
└── widgets/                      # menú lateral y diálogo "Servidor"
\`\`\`
`;
}

export async function generarFrontend(nodes: NodeType[], edges: EdgeType[], boardName?: string) {
  // Mismos nombres de atributos que el backend (Nombre -> nombre)
  nodes = normalizeAttributeNamesForCode(nodes);
  console.log(`🚀 Generando Frontend Flutter${boardName ? ` para: ${boardName}` : ''}`);
  console.log(`📊 Entidades encontradas: ${nodes.length}`);
  console.log(`🔗 Relaciones encontradas: ${edges.length}`);

  const zip = new JSZip();

  // Filtrar solo clases normales (no asociativas) para navegación y pantallas principales
  const classes = nodes.filter(node => !node.asociativa);
  // Todas las clases (incluir asociativas) para modelos y servicios
  const allClasses = nodes;

  // Estructura del proyecto Flutter
  const libFolder = zip.folder('flutter-mvp/lib');
  const modelsFolder = libFolder?.folder('models');
  const servicesFolder = libFolder?.folder('services');
  const screensFolder = libFolder?.folder('screens');
  const widgetsFolder = libFolder?.folder('widgets');

  // Archivos principales
  zip.file('flutter-mvp/pubspec.yaml', generatePubspecYaml());
  zip.file('flutter-mvp/analysis_options.yaml', generateAnalysisOptions());
  zip.file('flutter-mvp/README.md', generateReadme());

  // Código fuente principal
  libFolder?.file('main.dart', generateMainDart(classes, allClasses));

  // Generar modelos para cada clase (incluir asociativas)
  allClasses.forEach(cls => {
    modelsFolder?.file(
      `${cls.label.toLowerCase()}_model.dart`,
      generateModelForClass(cls, nodes, edges)
    );
  });

  // Generar servicios para cada clase (incluir asociativas)
  allClasses.forEach(cls => {
    servicesFolder?.file(`${cls.label.toLowerCase()}_service.dart`, generateServiceForClass(cls));
  });

  // Generar pantallas CRUD para cada clase
  classes.forEach(cls => {
    const screenFolder = screensFolder?.folder(cls.label.toLowerCase());
    screenFolder?.file(
      `${cls.label.toLowerCase()}_list_screen.dart`,
      generateListScreen(cls, nodes, edges)
    );
    screenFolder?.file(
      `${cls.label.toLowerCase()}_form_screen.dart`,
      generateFormScreen(cls, nodes, edges)
    );

    // Generar pantallas de detalles para relaciones muchos-a-muchos
    const manyToManyRelations = getManyToManyRelations(cls, nodes, edges).filter(
      rel => rel.isMainEntity
    );
    manyToManyRelations.forEach(relation => {
      screenFolder?.file(
        `${relation.associativeEntity.label.toLowerCase()}_details_screen.dart`,
        generateDetailsScreen(relation.associativeEntity, cls, relation.relatedEntity, nodes)
      );
      screenFolder?.file(
        `${relation.associativeEntity.label.toLowerCase()}_form_dialog.dart`,
        generateFormDialog(relation.associativeEntity, cls, relation.relatedEntity)
      );
    });
  });

  // Widgets compartidos
  widgetsFolder?.file('sidebar.dart', generateSidebar(classes));
  widgetsFolder?.file('app_drawer.dart', generateAppDrawer(classes));
  widgetsFolder?.file('server_config_dialog.dart', generateServerConfigDialog());
  widgetsFolder?.file('sync_banner.dart', generateSyncBanner());

  // Modo sin conexión
  const offlineFolder = libFolder?.folder('offline');
  offlineFolder?.file('local_store.dart', generateLocalStore());
  offlineFolder?.file('sync_service.dart', generateSyncService());
  offlineFolder?.file('offline_repository.dart', generateOfflineRepository());
  offlineFolder?.file('offline_http.dart', generateOfflineHttp());
  zip.file('flutter-mvp/android/gradle.properties', generateGradleProperties());

  // Android: permiso de internet y conexiones http:// al backend local
  zip.file('flutter-mvp/android/app/src/main/AndroidManifest.xml', generateAndroidManifest());

  // Archivo de configuración centralizada
  const configFolder = libFolder?.folder('config');
  configFolder?.file('api_config.dart', generateApiConfig());

  // Descargar proyecto completo
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'flutter-mvp.zip');

  console.log(`✅ Frontend Flutter generado exitosamente${boardName ? ` para: ${boardName}` : ''}`);
  console.log(`📦 Archivo descargado: flutter-mvp.zip`);
}
