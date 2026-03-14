# Release 4.2.2 - MCP MT5 Server Compatibility

**Fecha**: 2026-03-13  
**VersiÃ³n**: 4.2.2  
**Etapa**: Compatibilidad con SDK MCP actual

---

## Resumen Ejecutivo

Se actualiza `mcp-servers/mt5/mt5_server.py` para funcionar con la versiÃ³n actual del SDK MCP. Se corrigen imports obsoletos y el ciclo de ejecuciÃ³n del servidor usando `stdio_server` y el API de `list_*`/`call_tool`.

---

## Cambios Principales

### 1. ActualizaciÃ³n de API MCP (Python)
- Se removieron imports obsoletos (`Callback`, `ToolResult`)
- Decoradores actualizados a `@server.list_resources()` / `@server.read_resource()` / `@server.call_tool()`
- Registro de herramientas mediante `@server.list_tools()`
- Loop de ejecuciÃ³n con `stdio_server` + `server.run(...)`

---

## VerificaciÃ³n

```bash
python -m py_compile mcp-servers/mt5/mt5_server.py
```

---

## Notas

- El servidor MCP MT5 es de tipo stdio; debe ser lanzado por el cliente MCP.
