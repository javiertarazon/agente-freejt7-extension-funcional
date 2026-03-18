# Release 4.2.3 - Extension final operativa

**Fecha**: 2026-03-18  
**Version**: 4.2.3  
**Etapa**: Release correlativa operativa y lista para instalar

---

## Resumen Ejecutivo

Esta release consolida la linea 4.2.x en una rama correlativa dedicada, con version sincronizada en metadata, documentacion y empaquetado. La extension queda lista para distribuir como `.vsix` manteniendo el runtime bundlado, el router Copilot operativo y el paquete autosuficiente.

---

## Cambios Principales

### 1. Versionado coherente
- `package.json` y `package-lock.json` actualizados a `4.2.3`
- `VERSION` alineado con la version real de distribucion
- `README.md` y `CHANGELOG.md` sincronizados con el nuevo artefacto

### 2. Entregable instalable
- Se regenera el bundle `dist/extension.cjs` antes del empaquetado
- Se deja listo el archivo `agente-freejt7-extension-funcional-4.2.3.vsix`
- Se valida la instalacion forzada en VS Code para confirmar que la extension carga desde el paquete final

---

## Verificacion ejecutada

```powershell
npm.cmd run build:bundle
npm.cmd audit --json
npm.cmd run package:local
code --install-extension agente-freejt7-extension-funcional-4.2.3.vsix --force
node copilot_router.js --goal "Describe este workspace en 2 lineas y no edites archivos" --workspace . --json
```

---

## Notas

- Se conserva el enfoque de `.vsix` autosuficiente: el runtime pesado de Copilot sigue incluido por decision de producto.
- Esta rama queda lista para revision o merge segun el flujo de release que quieras usar despues.
