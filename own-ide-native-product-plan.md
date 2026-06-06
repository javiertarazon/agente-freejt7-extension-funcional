# Free JT7 Own-IDE Native Product Plan

## Goal
Convertir Free JT7 de una VSIX montada sobre VSCodium a un producto IDE agent-first donde el agente sea dueño del chat, panel, providers, modelos, memoria, subagentes, politica operativa y empaquetado standalone.

## Current Root Cause
- El bootstrap de own-ide sigue instalando una VSIX dentro del perfil aislado.
- El runtime y el panel siguen leyendo provider/model/runtime desde settings y globalState del host.
- Los paquetes deb/rpm siguen distribuyendo un launcher que reinstala/extiende una extension en lugar de un producto con control-plane propio.

## Native Control Surface
- Chat y task console propios, sin depender del host de Copilot Chat.
- Providers y modelos: proveedor activo, modelo activo, auth profile, fallbacks, catálogo y proveedores personalizados.
- Runtime: backend activo, perfil de politica, modo de autonomia, worker pool, visibilidad del host.
- Memoria: persistencia de perfil, compaction/context budgeting, restauracion de sesiones y journal de tareas.
- Orquestacion: subagentes habilitados, politica de delegacion, verificacion y evidencia por tarea.
- Producto/IDE: owner mode, apertura automatica, migracion de perfiles y actualizaciones del paquete.

## Packaging Target
- Linux deb: instalador principal para Debian/Ubuntu/Zorin.
- Linux rpm: instalador principal para Fedora/RHEL/openSUSE.
- AppImage: portable para prueba y distribucion sin instalacion.
- tar.gz portable: modo soporte/diagnostico.

## Tasks
- [x] Crear control-plane app-owned del perfil propio y hacerlo fuente preferente en standalone para provider/runtime/owner mode. Verify: `npm run test:freejt7-app-bootstrap-smoke` y analisis sin errores en runtime/panel.
- [ ] Sacar el estado operativo principal del panel de `globalState` a almacenamiento propio del perfil. Verify: cambiar provider/modelo, reiniciar own-ide y conservar estado sin depender del host.
- [ ] Construir settings nativos del producto dentro del panel propio. Verify: desde UI se puede seleccionar provider/modelo, auth profile, autonomia y host visibility.
- [ ] Añadir registro nativo de providers y custom providers. Verify: agregar un proveedor nuevo, persistirlo y listar modelos disponibles.
- [ ] Introducir gestor de memoria y presupuesto de contexto del producto. Verify: restaurar conversacion, conservar memoria persistente y registrar compaction/token budget.
- [ ] Introducir orquestacion de subagentes con evidencia. Verify: una tarea delega subagentes y muestra trazabilidad/resultados en la UI propia.
- [ ] Invertir el empaquetado para que el bundle sea del producto y no un instalador de extension. Verify: deb/rpm/appimage arrancan con branding/control-plane propios y sin bucle de reinstalacion VSIX como fuente de verdad.
- [ ] Dejar el modo extension solo como bridge opcional. Verify: own-ide funciona con compatibilidad de extension degradada o desactivada.

## Migration Phases
- Phase A: control-plane nativo del perfil sobre el shell actual. Estado: iniciado en esta iteracion.
- Phase B: persistencia nativa de panel/providers/runtime/memoria.
- Phase C: UI nativa de settings/chat/providers/subagentes.
- Phase D: empaquetado y canal de actualizacion del producto.

## Done When
- [ ] Own-ide arranca con control-plane propio como fuente de verdad.
- [ ] Provider/model/API/auth se gestionan desde UI nativa del producto.
- [ ] Memoria persistente, contexto y subagentes son capacidades first-class del IDE.
- [ ] El paquete standalone se describe y opera como producto Free JT7, no como extension instalada en segundo plano.