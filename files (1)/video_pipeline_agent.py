"""
video_pipeline_agent.py
------------------------
Pipeline completo: Prompt de texto → Claude Design → Remotion → Video MP4
Orquesta los agentes claude_design_agent y remotion_agent en un solo flujo.

Uso:
    python video_pipeline_agent.py --prompt "Tu descripción de video aquí"
    python video_pipeline_agent.py --prompt "..." --preview
    python video_pipeline_agent.py --interactive
"""

import os
import json
import argparse
import time
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Importar los agentes
from claude_design_agent import generate_design_system, refine_design, save_design
from remotion_agent import generate_remotion_code, write_remotion_files, render_video, open_studio

load_dotenv()

OUTPUT_DIR = Path(os.getenv("OUTPUT_VIDEO_PATH", "./output_videos"))

# ─── Banner ───────────────────────────────────────────────────────────────────

BANNER = """
╔══════════════════════════════════════════════════════════╗
║         🎬 CLAUDE + REMOTION VIDEO PIPELINE              ║
║      Texto → Diseño IA → Código React → Video MP4        ║
╚══════════════════════════════════════════════════════════╝
"""

# ─── Pipeline Principal ───────────────────────────────────────────────────────

def run_pipeline(
    prompt: str,
    output_name: Optional[str] = None,
    preview: bool = False,
    save_intermediates: bool = True,
    verbose: bool = False
) -> dict:
    """
    Ejecuta el pipeline completo: prompt → diseño → código → video.
    
    Args:
        prompt: Descripción del video en lenguaje natural
        output_name: Nombre base para el archivo de salida (sin extensión)
        preview: Abrir Remotion Studio en lugar de renderizar
        save_intermediates: Guardar archivos intermedios (JSON, TSX)
        verbose: Mostrar output detallado
    
    Returns:
        dict con rutas y métricas del resultado
    """
    print(BANNER)
    
    # Crear directorio de salida
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Nombre del archivo de salida
    if not output_name:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_name = f"video_{timestamp}"
    
    results = {
        "prompt": prompt,
        "output_name": output_name,
        "start_time": time.time(),
        "files": {}
    }

    # ── PASO 1: Claude Design Agent ──────────────────────────────────────────
    print("┌─────────────────────────────────────────────┐")
    print("│  PASO 1/3: Claude Design Agent               │")
    print("└─────────────────────────────────────────────┘")
    
    step_start = time.time()
    design = generate_design_system(prompt, verbose=verbose)
    results["design_time"] = round(time.time() - step_start, 2)
    
    # Guardar diseño si se solicita
    if save_intermediates:
        design_path = OUTPUT_DIR / f"{output_name}_design.json"
        save_design(design, str(design_path))
        results["files"]["design"] = str(design_path)

    # ── PASO 2: Remotion Agent (generar código) ───────────────────────────────
    print("\n┌─────────────────────────────────────────────┐")
    print("│  PASO 2/3: Generando Código Remotion          │")
    print("└─────────────────────────────────────────────┘")
    
    step_start = time.time()
    tsx_code = generate_remotion_code(design, verbose=verbose)
    
    print("\n📝 Escribiendo archivos en proyecto Remotion...")
    write_remotion_files(design, tsx_code)
    results["code_time"] = round(time.time() - step_start, 2)
    
    if save_intermediates:
        tsx_path = OUTPUT_DIR / f"{output_name}_template.tsx"
        tsx_path.write_text(tsx_code, encoding="utf-8")
        results["files"]["tsx"] = str(tsx_path)
        print(f"   📄 TSX guardado: {tsx_path}")

    # ── PASO 3: Renderizado ───────────────────────────────────────────────────
    print("\n┌─────────────────────────────────────────────┐")
    print("│  PASO 3/3: Renderizado de Video               │")
    print("└─────────────────────────────────────────────┘")
    
    step_start = time.time()
    video_path = OUTPUT_DIR / f"{output_name}.mp4"
    
    if preview:
        print("\n👁️  Modo preview: abriendo Remotion Studio...")
        open_studio()
        results["mode"] = "preview"
    else:
        video_file = render_video(str(video_path))
        results["files"]["video"] = str(video_file)
        results["video_size_mb"] = round(video_file.stat().st_size / 1024 / 1024, 2)
        results["render_time"] = round(time.time() - step_start, 2)
        results["mode"] = "rendered"

    # ── Resumen Final ─────────────────────────────────────────────────────────
    results["total_time"] = round(time.time() - results["start_time"], 2)
    
    print("\n" + "═" * 60)
    print("  ✨ PIPELINE COMPLETADO")
    print("═" * 60)
    print(f"  📋 Prompt:    {prompt[:60]}...")
    print(f"  🎨 Diseño:    {results.get('design_time', 0)}s")
    print(f"  ⚛️  Código:    {results.get('code_time', 0)}s")
    if results["mode"] == "rendered":
        print(f"  🎬 Render:    {results.get('render_time', 0)}s")
        print(f"  📦 Video:     {results.get('video_size_mb', 0)} MB")
        print(f"  💾 Guardado:  {results['files'].get('video', 'N/A')}")
    print(f"  ⏱️  Total:     {results['total_time']}s")
    print("═" * 60)
    
    return results

def interactive_pipeline():
    """Pipeline interactivo con iteración de diseño."""
    print(BANNER)
    print("Modo Interactivo: Itera sobre tu video con Claude\n")
    
    # Prompt inicial
    prompt = input("🎬 Describe tu video: ").strip()
    if not prompt:
        prompt = "Video de presentación corporativa minimalista de 15 segundos"

    # Generar diseño inicial
    design = generate_design_system(prompt, verbose=True)
    
    print("\n📊 Diseño generado:")
    print(f"   Título: {design.get('title')}")
    print(f"   Escenas: {len(design.get('scenes', []))}")
    print(f"   Duración: {design.get('duration_frames')} frames")
    
    # Loop de iteración
    while True:
        print("\n" + "─" * 50)
        action = input("¿Qué quieres hacer?\n"
                      "  [1] Refinar diseño\n"
                      "  [2] Generar código Remotion\n"
                      "  [3] Renderizar video\n"
                      "  [4] Ver Remotion Studio\n"
                      "  [5] Ver diseño JSON\n"
                      "  [6] Salir\n"
                      "→ ").strip()
        
        if action == "1":
            feedback = input("¿Qué quieres cambiar? ").strip()
            design = refine_design(design, feedback)
            print("✅ Diseño refinado")
        
        elif action == "2":
            tsx_code = generate_remotion_code(design, verbose=True)
            write_remotion_files(design, tsx_code)
            print("✅ Archivos Remotion actualizados")
        
        elif action == "3":
            name = input("Nombre del archivo [video_output]: ").strip() or "video_output"
            tsx_code = generate_remotion_code(design)
            write_remotion_files(design, tsx_code)
            render_video(str(OUTPUT_DIR / f"{name}.mp4"))
        
        elif action == "4":
            tsx_code = generate_remotion_code(design)
            write_remotion_files(design, tsx_code)
            open_studio()
        
        elif action == "5":
            print(json.dumps(design, indent=2, ensure_ascii=False))
        
        elif action == "6":
            print("\n👋 Hasta luego!")
            break

# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Video Pipeline Agent — De texto a video con Claude + Remotion"
    )
    parser.add_argument("--prompt", type=str,
                        help="Descripción del video en lenguaje natural")
    parser.add_argument("--output", type=str, default=None,
                        help="Nombre base del archivo de salida (sin extensión)")
    parser.add_argument("--preview", action="store_true",
                        help="Abrir Remotion Studio en lugar de renderizar")
    parser.add_argument("--interactive", action="store_true",
                        help="Modo interactivo con iteración")
    parser.add_argument("--verbose", action="store_true",
                        help="Mostrar output detallado de Claude")
    parser.add_argument("--no-save-intermediates", action="store_true",
                        help="No guardar archivos intermedios JSON/TSX")
    
    args = parser.parse_args()

    if args.interactive:
        interactive_pipeline()
    elif args.prompt:
        run_pipeline(
            prompt=args.prompt,
            output_name=args.output,
            preview=args.preview,
            save_intermediates=not args.no_save_intermediates,
            verbose=args.verbose
        )
    else:
        # Demo por defecto
        demo = "Anuncio tech de 10 segundos para una app de productividad con estética minimalista"
        run_pipeline(prompt=demo, verbose=True)

if __name__ == "__main__":
    main()
