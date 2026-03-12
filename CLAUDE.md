# Proyecto: agente-freejt7-extension-funcional

Este directorio contiene el runtime de Free JT7, los bridges para IDEs y
el sistema de gestion del catalogo de skills.

## Comandos del proyecto
- Validacion: `python skills_manager.py policy-validate`
- Estado: `python skills_manager.py doctor --strict`
- Skills activas: `python skills_manager.py list --active`
- Sincronizar Claude: `python skills_manager.py sync-claude`

<!-- SKILLS_LIBRARY_START -->
## Skills Library â€” Contexto Experto

Directorio: `.github/skills/` â€” **964 skills** en el indice.
Actualizacion: 2026-03-06 14:10 UTC

### Comandos de gestion
```
python skills_manager.py list              # listar todas
python skills_manager.py list --active     # ver activas
python skills_manager.py search QUERY      # buscar
python skills_manager.py activate   ID     # activar
python skills_manager.py deactivate ID     # desactivar
python skills_manager.py fetch             # importar skills
python skills_manager.py github-search Q   # buscar repos
```

### Skills Activas (4 de 964)

Lee los archivos SKILL.md listados abajo al responder preguntas
en ese dominio. Aplica su metodologia y mejores practicas.

| Skill | Archivo | Descripcion |
|-------|---------|-------------|
| free-jt7-global-runtime-audit | .github/skills/free-jt7-global-runtime-audit/SKILL.md | Audit and enforce Free JT7 global runtime behavior across IDEs (C |
| systematic-debugging | .github/skills/systematic-debugging/SKILL.md | Use when encountering any bug, test failure, or unexpected behavi |
| using-superpowers | .github/skills/using-superpowers/SKILL.md | Use when starting any conversation - establishes how to find and  |
| verification-before-completion | .github/skills/verification-before-completion/SKILL.md | Use when about to claim work is complete, fixed, or passing, befo |

> **Instruccion para Claude**: Al inicio de cada sesion, lee los
> archivos SKILL.md de la tabla anterior. Cuando el usuario haga
> una solicitud relacionada con esa area, aplica el contexto experto
> de la skill correspondiente.
<!-- SKILLS_LIBRARY_END -->
