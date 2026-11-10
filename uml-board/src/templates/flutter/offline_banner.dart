import 'package:flutter/material.dart';

import '../data/offline_store.dart';
import '../data/sync_service.dart';

/// Barra inferior que avisa cuando no hay conexión o hay cambios por enviar.
/// Al tocarla (con conexión) fuerza la sincronización.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final sync = SyncService.instance;
    final store = OfflineStore.instance;

    return AnimatedBuilder(
      animation: Listenable.merge([sync.online, sync.syncing, sync.lastError, store.pendingCount]),
      builder: (context, _) {
        final online = sync.online.value;
        final syncing = sync.syncing.value;
        final pending = store.pendingCount.value;
        final error = sync.lastError.value;

        if (online && !syncing && pending == 0 && error == null) {
          return const SizedBox.shrink();
        }

        final Color color;
        final IconData icon;
        final String text;
        VoidCallback? onTap;

        if (!online) {
          color = Colors.orange.shade800;
          icon = Icons.cloud_off;
          text = pending > 0
              ? 'Sin conexión · $pending cambio(s) se enviarán al volver la red'
              : 'Sin conexión · mostrando los datos guardados en el teléfono';
        } else if (syncing || pending > 0) {
          color = Colors.blue.shade700;
          icon = Icons.sync;
          text = 'Sincronizando $pending cambio(s)…';
          onTap = sync.syncNow;
        } else {
          color = Colors.red.shade700;
          icon = Icons.error_outline;
          text = '$error (toca para cerrar)';
          onTap = sync.clearError;
        }

        return Material(
          color: color,
          child: SafeArea(
            top: false,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    Icon(icon, color: Colors.white, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        text,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
