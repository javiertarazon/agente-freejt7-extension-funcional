"""
claude_design_agent.py
----------------------
Agente que usa Claude para generar sistemas de diseño completos:
colores, tipografía, animaciones y estructura de video.

Uso:
    python claude_design_agent.py --prompt "Video tech minimalista 15 segundos"
    python claude_design_agent.py --interactive
"""

import os
import json
import argparse
from pathlib import Path
from typing import Optional
import anthropic
from dotenv import load_dotenv

load_dotenv()

# ─── Configuración ────────────────────────────────────────────────────────────

CLIENT = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

DESIGN_SYSTEM_PROMPT = """
Eres un experto en diseño visual y motion graphics para video.
Tu tarea es generar un SISTEMA DE DISEÑO COMPLETO en formato JSON estructurado.

El JSON debe contener EXACTAMENTE estos campos:

{
  "title": "Nombre del video",
  "duration_frames": 300,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "theme": {
    "colors": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "text_primary": "#hex",
      "text_secondary": "#hex"
    },
    "typography": {
      "heading_font": "nombre de Google Font",
      "body_font": "nombre de Google Font",
      "heading_size": 72,
      "body_size": 32,
      "font_weight_heading": 700,
      "font_weight_body": 400
    },
    "style": "minimalista | bold | corporate | playful | cinematic"
  },
  "scenes": [
    {
      "id": "scene_1",
      "name": "Intro",
      "start_frame": 0,
      "end_frame": 90,
      "type": "title | content | outro | transition",
      "layout": "centered | split | overlay | grid",
      "elements": [
        {
          "type": "text | image | shape | logo",
          "content": "Texto o descripción",
          "animation": "fadeIn | slideUp | zoomIn | typewriter | none",
          "animation_delay": 0,
          "animation_duration": 30,
          "position": {"x": 50, "y": 50},
          "size": {"width": 80, "height": 20},
          "style": {}
        }
      ],
      "background": {
        "type": "solid | gradient | video",
        "value": "#hex o 'linear-gradient(...)'"
      },
      "transition_in": "fade | slide | zoom | none",
      "transition_out": "fade | slide | zoom | none"
    }
  ],
  "audio": {
    "background_music": "descripción del estilo musical",
    "volume": 0.3
  },
  "export": {
    "format": "mp4",
    "codec": "h264",
    "quality": "high"
  }
}

REGLAS IMPORTANTES:
- Responde SOLO con el JSON, sin texto adicional ni markdown
- Los frames totales deben coincidir con duration_frames
- Cada escena debe tener al menos 1 elemento
- Las animaciones deben tener tiempos coherentes con los frames
- Usa paletas de colores profesionales y coherentes
"""

# ─── Funciones del Agente ─────────────────────────────────────────────────────

def generate_design_system(prompt: str, verbose: bool = False) -> dict:
    """
    Llama a Claude para generar un sistema de diseño completo.
    
    Args:
        prompt: Descripción del video/diseño deseado
        verbose: Mostrar el razonamiento de Claude
    
    Returns:
        dict con el sistema de diseño completo
    """
    print(f"\n🎨 Claude Design Agent iniciado...")
    print(f"   Prompt: {prompt}\n")

    messages = [
        {
            "role": "user",
            "content": f"Crea un sistema de diseño para: {prompt}"
        }
    ]

    # Llamada a Claude con streaming para ver el progreso
    design_json = ""
    
    if verbose:
        print("─" * 50)
        print("📝 Respuesta de Claude:")
        print("─" * 50)

    with CLIENT.messages.stream(
        model=MODEL,
        max_tokens=4096,
        system=DESIGN_SYSTEM_PROMPT,
        messages=messages
    ) as stream:
        for text in stream.text_stream:
            design_json += text
            if verbose:
                print(text, end="", flush=True)

    if verbose:
        print("\n" + "─" * 50)

    # Parsear el JSON generado
    try:
        # Limpiar posibles bloques de markdown
        clean_json = design_json.strip()
        if clean_json.startswith("```"):
            clean_json = clean_json.split("```")[1]
            if clean_json.startswith("json"):
                clean_json = clean_json[4:]
        
        design = json.loads(clean_json)
        print(f"✅ Sistema de diseño generado: {design.get('title', 'Sin título')}")
        print(f"   Escenas: {len(design.get('scenes', []))}")
        print(f"   Duración: {design.get('duration_frames', 0)} frames @ {design.get('fps', 30)}fps")
        return design
    
    except json.JSONDecodeError as e:
        print(f"❌ Error al parsear JSON de Claude: {e}")
        print("   Respuesta cruda:", design_json[:200])
        raise

def refine_design(design: dict, feedback: str) -> dict:
    """
    Refina un diseño existente con feedback adicional.
    
    Args:
        design: Sistema de diseño actual (dict)
        feedback: Instrucciones de refinamiento
    
    Returns:
        dict con el diseño refinado
    """
    print(f"\n🔄 Refinando diseño con feedback: {feedback}")

    messages = [
        {
            "role": "user",
            "content": f"Aquí está el sistema de diseño actual:\n{json.dumps(design, indent=2)}"
        },
        {
            "role": "assistant",
            "content": json.dumps(design, indent=2)
        },
        {
            "role": "user",
            "content": f"Por favor, refina el diseño con estos cambios: {feedback}. Responde SOLO con el JSON actualizado."
        }
    ]

    response = CLIENT.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=DESIGN_SYSTEM_PROMPT,
        messages=messages
    )

    refined_text = response.content[0].text
    clean_json = refined_text.strip().strip("```json").strip("```")
    return json.loads(clean_json)

def save_design(design: dict, output_path: str = "./design_output.json") -> Path:
    """Guarda el sistema de diseño en un archivo JSON."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(design, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Diseño guardado en: {path.resolve()}")
    return path

def interactive_mode():
    """Modo interactivo para iterar sobre el diseño con Claude."""
    print("\n" + "═" * 60)
    print("  🎨 CLAUDE DESIGN AGENT — Modo Interactivo")
    print("═" * 60)
    print("  Comandos: 'refinar', 'guardar', 'ver', 'salir'\n")

    prompt = input("📋 Describe tu video: ").strip()
    if not prompt:
        prompt = "Video promocional moderno de 15 segundos"

    design = generate_design_system(prompt, verbose=True)
    
    while True:
        cmd = input("\n🎯 Acción (refinar/guardar/ver/salir): ").strip().lower()
        
        if cmd == "salir":
            break
        elif cmd == "ver":
            print(json.dumps(design, indent=2, ensure_ascii=False))
        elif cmd == "guardar":
            path = input("   Ruta de guardado [design_output.json]: ").strip()
            save_design(design, path or "design_output.json")
        elif cmd == "refinar":
            feedback = input("   ¿Qué quieres cambiar? ").strip()
            design = refine_design(design, feedback)
            print("✅ Diseño refinado exitosamente")
        else:
            print("   Comando no reconocido")
    
    return design

# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Claude Design Agent — Genera sistemas de diseño para video"
    )
    parser.add_argument("--prompt", type=str, help="Descripción del diseño/video")
    parser.add_argument("--output", type=str, default="design_output.json",
                        help="Archivo de salida JSON")
    parser.add_argument("--verbose", action="store_true",
                        help="Mostrar respuesta completa de Claude")
    parser.add_argument("--interactive", action="store_true",
                        help="Modo interactivo para iterar el diseño")
    
    args = parser.parse_args()

    if args.interactive:
        design = interactive_mode()
    elif args.prompt:
        design = generate_design_system(args.prompt, verbose=args.verbose)
        save_design(design, args.output)
    else:
        # Demo por defecto
        demo_prompt = "Video tech minimalista de 10 segundos para lanzamiento de app"
        design = generate_design_system(demo_prompt, verbose=True)
        save_design(design, args.output)
    
    print("\n✨ Claude Design Agent completado exitosamente")
    return design

if __name__ == "__main__":
    main()
