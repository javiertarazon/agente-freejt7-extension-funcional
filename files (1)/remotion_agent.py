"""
remotion_agent.py
-----------------
Agente que convierte un sistema de diseño JSON (generado por Claude)
en componentes React/TypeScript para Remotion y los renderiza como MP4.

Uso:
    python remotion_agent.py --design design_output.json --output video.mp4
    python remotion_agent.py --design design_output.json --preview
"""

import os
import json
import subprocess
import argparse
from pathlib import Path
from typing import Optional
import anthropic
from dotenv import load_dotenv

load_dotenv()

CLIENT = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
REMOTION_PATH = Path(os.getenv("REMOTION_PROJECT_PATH", "./remotion_project"))

# ─── System Prompt para generar código Remotion ───────────────────────────────

REMOTION_CODE_PROMPT = """
Eres un experto en Remotion (librería React para videos programáticos).
Tu tarea es convertir un sistema de diseño JSON en componentes React/TypeScript funcionales.

REGLAS DEL CÓDIGO:
1. Usa SOLO imports de 'remotion': useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, AbsoluteFill
2. Para fuentes de Google: importar con @remotion/google-fonts
3. Cada escena es un componente React separado
4. Usa `interpolate` para animaciones basadas en frames
5. Usa `spring` para animaciones con física (más naturales)
6. Las posiciones deben ser en píxeles o porcentajes (no rem/em)
7. Exporta el componente principal como `export default`

ESTRUCTURA REQUERIDA del archivo VideoTemplate.tsx:
```tsx
import { AbsoluteFill, interpolate, spring, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';

// Componentes de escenas individuales
const Scene1: React.FC = () => { ... };
const Scene2: React.FC = () => { ... };

// Composición principal
const VideoTemplate: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={90}>
        <Scene1 />
      </Sequence>
      <Sequence from={90} durationInFrames={90}>
        <Scene2 />
      </Sequence>
    </AbsoluteFill>
  );
};

export default VideoTemplate;
```

Responde SOLO con el código TypeScript/TSX válido, sin explicaciones ni markdown.
"""

# ─── Generar código Remotion con Claude ───────────────────────────────────────

def generate_remotion_code(design: dict, verbose: bool = False) -> str:
    """
    Usa Claude para convertir el diseño JSON en código Remotion (TSX).
    
    Args:
        design: Sistema de diseño (dict)
        verbose: Mostrar código generado
    
    Returns:
        Código TSX como string
    """
    print("\n⚛️  Remotion Agent: Generando código TSX...")

    messages = [
        {
            "role": "user",
            "content": (
                f"Convierte este sistema de diseño en un componente Remotion completo:\n\n"
                f"{json.dumps(design, indent=2, ensure_ascii=False)}\n\n"
                f"Genera el archivo VideoTemplate.tsx completo y funcional."
            )
        }
    ]

    tsx_code = ""
    with CLIENT.messages.stream(
        model=MODEL,
        max_tokens=8192,
        system=REMOTION_CODE_PROMPT,
        messages=messages
    ) as stream:
        for text in stream.text_stream:
            tsx_code += text
            if verbose:
                print(text, end="", flush=True)

    # Limpiar bloques de markdown si Claude los incluyó
    if "```" in tsx_code:
        parts = tsx_code.split("```")
        for i, part in enumerate(parts):
            if part.startswith("tsx") or part.startswith("typescript"):
                tsx_code = part.split("\n", 1)[1] if "\n" in part else part
                break

    print(f"\n✅ Código TSX generado ({len(tsx_code)} caracteres)")
    return tsx_code.strip()

def write_remotion_files(design: dict, tsx_code: str) -> None:
    """Escribe todos los archivos necesarios en el proyecto Remotion."""
    
    src_path = REMOTION_PATH / "src"
    src_path.mkdir(parents=True, exist_ok=True)

    # 1. Escribir el componente de video
    template_path = src_path / "VideoTemplate.tsx"
    template_path.write_text(tsx_code, encoding="utf-8")
    print(f"   📄 VideoTemplate.tsx → {template_path}")

    # 2. Generar Root.tsx con la configuración de la composición
    root_content = f"""
import {{ Composition }} from 'remotion';
import VideoTemplate from './VideoTemplate';

export const RemotionRoot: React.FC = () => {{
  return (
    <>
      <Composition
        id="VideoTemplate"
        component={{VideoTemplate}}
        durationInFrames={{{design.get('duration_frames', 300)}}}
        fps={{{design.get('fps', 30)}}}
        width={{{design.get('width', 1920)}}}
        height={{{design.get('height', 1080)}}}
      />
    </>
  );
}};
""".strip()

    root_path = src_path / "Root.tsx"
    root_path.write_text(root_content, encoding="utf-8")
    print(f"   📄 Root.tsx → {root_path}")

    # 3. Guardar el diseño JSON como referencia
    design_path = REMOTION_PATH / "design.json"
    design_path.write_text(json.dumps(design, indent=2, ensure_ascii=False))
    print(f"   📄 design.json → {design_path}")

def render_video(
    output_path: str = "./output.mp4",
    composition: str = "VideoTemplate",
    props: Optional[dict] = None
) -> Path:
    """
    Ejecuta el renderizado de Remotion vía CLI.
    
    Args:
        output_path: Ruta del archivo MP4 de salida
        composition: ID de la composición a renderizar
        props: Props adicionales para la composición
    
    Returns:
        Path del video generado
    """
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    print(f"\n🎬 Renderizando video con Remotion...")
    print(f"   Composición: {composition}")
    print(f"   Salida: {output.resolve()}")

    # Construir comando de Remotion
    cmd = [
        "npx", "remotion", "render",
        str(REMOTION_PATH),
        composition,
        str(output.resolve()),
        "--overwrite"
    ]

    if props:
        cmd += ["--props", json.dumps(props)]

    # Ejecutar con output en tiempo real
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    progress_lines = []
    for line in process.stdout:
        line = line.rstrip()
        if line:
            progress_lines.append(line)
            # Mostrar líneas de progreso relevantes
            if any(kw in line.lower() for kw in ["rendering", "encoded", "frame", "%", "error", "done"]):
                print(f"   {line}")

    process.wait()

    if process.returncode != 0:
        print(f"\n❌ Error en Remotion render (código {process.returncode})")
        print("   Últimas líneas de log:")
        for line in progress_lines[-10:]:
            print(f"   {line}")
        raise RuntimeError(f"Remotion render falló con código {process.returncode}")

    print(f"\n✅ Video renderizado: {output.resolve()}")
    print(f"   Tamaño: {output.stat().st_size / 1024 / 1024:.1f} MB")
    return output

def open_studio():
    """Abre Remotion Studio para previsualización en el navegador."""
    print("\n🖥️  Abriendo Remotion Studio...")
    print("   URL: http://localhost:3000")
    print("   Presiona Ctrl+C para cerrar\n")
    
    subprocess.run(
        ["npx", "remotion", "studio", str(REMOTION_PATH)],
        check=True
    )

# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Remotion Agent — Convierte diseño JSON en video MP4"
    )
    parser.add_argument("--design", type=str, required=True,
                        help="Ruta al archivo design_output.json")
    parser.add_argument("--output", type=str, default="./output_videos/video.mp4",
                        help="Ruta del video de salida")
    parser.add_argument("--preview", action="store_true",
                        help="Abrir Remotion Studio en lugar de renderizar")
    parser.add_argument("--verbose", action="store_true",
                        help="Mostrar código TSX generado")
    parser.add_argument("--only-code", action="store_true",
                        help="Solo generar código TSX, no renderizar")
    
    args = parser.parse_args()

    # Cargar el diseño
    design_path = Path(args.design)
    if not design_path.exists():
        print(f"❌ Archivo de diseño no encontrado: {design_path}")
        return
    
    with open(design_path, encoding="utf-8") as f:
        design = json.load(f)
    
    print(f"📂 Diseño cargado: {design.get('title', 'Sin título')}")

    # Generar código Remotion con Claude
    tsx_code = generate_remotion_code(design, verbose=args.verbose)
    
    # Escribir archivos en el proyecto Remotion
    print("\n📝 Escribiendo archivos Remotion...")
    write_remotion_files(design, tsx_code)

    if args.only_code:
        print("\n✨ Código generado. Usa --preview para visualizar.")
        return

    if args.preview:
        open_studio()
    else:
        render_video(args.output)
        print("\n✨ Pipeline Remotion completado exitosamente")

if __name__ == "__main__":
    main()
