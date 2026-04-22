// VideoTemplate.tsx
// Este archivo es GENERADO AUTOMÁTICAMENTE por el Remotion Agent (Claude).
// No editar manualmente — re-ejecutar el pipeline para regenerar.

import {
  AbsoluteFill,
  interpolate,
  spring,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  staticFile,
} from 'remotion';
import React from 'react';

// ─── Utilidades de Animación ──────────────────────────────────────────────────

const fadeIn = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const slideUp = (frame: number, start: number, duration: number, distance = 50) =>
  interpolate(frame, [start, start + duration], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const scaleIn = (frame: number, start: number, fps: number) =>
  spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 100 } });

// ─── Escena 1: Intro ──────────────────────────────────────────────────────────

const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = fadeIn(frame, 0, 20);
  const titleY   = slideUp(frame, 5, 25);
  const scale    = scaleIn(frame, 0, fps);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      {/* Logo / Icono */}
      <div
        style={{
          transform: `scale(${scale})`,
          marginBottom: 40,
          opacity,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #6c63ff, #3ecfcf)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 40, color: 'white' }}>▶</span>
        </div>
      </div>

      {/* Título */}
      <h1
        style={{
          color: '#ffffff',
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "'Space Grotesk', sans-serif",
          transform: `translateY(${titleY}px)`,
          opacity,
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-2px',
        }}
      >
        Tu Título Aquí
      </h1>

      {/* Subtítulo */}
      <p
        style={{
          color: '#a0a0b0',
          fontSize: 28,
          fontFamily: "'Inter', sans-serif",
          opacity: fadeIn(frame, 15, 20),
          transform: `translateY(${slideUp(frame, 15, 25)}px)`,
          margin: '16px 0 0',
        }}
      >
        Subtítulo o tagline del producto
      </p>
    </AbsoluteFill>
  );
};

// ─── Escena 2: Contenido ──────────────────────────────────────────────────────

const SceneContent: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px',
      }}
    >
      <div
        style={{
          opacity: fadeIn(frame, 0, 20),
          transform: `translateY(${slideUp(frame, 0, 20)}px)`,
          maxWidth: 900,
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#1a1a2e',
            fontFamily: "'Space Grotesk', sans-serif",
            margin: '0 0 24px',
          }}
        >
          Característica Principal
        </h2>
        <p
          style={{
            fontSize: 28,
            color: '#555577',
            fontFamily: "'Inter', sans-serif",
            lineHeight: 1.6,
            opacity: fadeIn(frame, 10, 20),
          }}
        >
          Descripción breve del beneficio o valor principal
          que ofrece tu producto o servicio.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Escena 3: Call to Action ─────────────────────────────────────────────────

const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const btnScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 12, stiffness: 150 },
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #6c63ff 0%, #3ecfcf 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      <h2
        style={{
          color: '#ffffff',
          fontSize: 64,
          fontWeight: 800,
          fontFamily: "'Space Grotesk', sans-serif",
          opacity: fadeIn(frame, 0, 20),
          margin: 0,
        }}
      >
        Empieza Ahora
      </h2>

      <div
        style={{
          transform: `scale(${btnScale})`,
          background: '#ffffff',
          color: '#6c63ff',
          padding: '20px 60px',
          borderRadius: 60,
          fontSize: 28,
          fontWeight: 700,
          fontFamily: "'Inter', sans-serif",
          opacity: fadeIn(frame, 5, 15),
        }}
      >
        Descárgalo Gratis →
      </div>
    </AbsoluteFill>
  );
};

// ─── Composición Principal ────────────────────────────────────────────────────

const VideoTemplate: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Escena 1: Intro (0-90 frames = 3 segundos @ 30fps) */}
      <Sequence from={0} durationInFrames={90}>
        <SceneIntro />
      </Sequence>

      {/* Escena 2: Contenido (90-210 frames = 4 segundos) */}
      <Sequence from={90} durationInFrames={120}>
        <SceneContent />
      </Sequence>

      {/* Escena 3: CTA (210-300 frames = 3 segundos) */}
      <Sequence from={210} durationInFrames={90}>
        <SceneCTA />
      </Sequence>
    </AbsoluteFill>
  );
};

export default VideoTemplate;
