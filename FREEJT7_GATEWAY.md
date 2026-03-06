# Free JT7 Gateway Runbook

- Proyecto: `<ruta-del-proyecto-activo>`
- Config: `<proyecto>/.openclaw/openclaw.json`
- Estado: `<proyecto>/.openclaw/state`
- IDE/modelo por defecto: `vscode` / `github-copilot` / `copilot-default`
- Retencion objetivo: `30 dias`

## Comandos rapidos
```powershell
python skills_manager.py easy-onboard --project "D:\ruta\proyecto" --interactive
python skills_manager.py credentials-wizard --project "D:\ruta\proyecto" --interactive
python skills_manager.py credentials-apply --project "D:\ruta\proyecto"
python skills_manager.py gateway-status
python skills_manager.py gateway-start --dry-run
python skills_manager.py channel-login --channel whatsapp
python skills_manager.py channel-login --channel telegram
python skills_manager.py pairing-list --channel telegram
python skills_manager.py pairing-approve --channel telegram --code <CODE>
python skills_manager.py plugin-list
python skills_manager.py plugin-validate
python skills_manager.py phase7-smoke
python skills_manager.py gateway-resilience
```
