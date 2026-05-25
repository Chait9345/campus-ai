"use client";

import {
  Component,
  ReactNode,
  Suspense,
  memo,
  useEffect,
  useRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { motion } from "framer-motion";
import * as THREE from "three";
import type { Group } from "three";

useGLTF.preload("/models/avatar.glb");

export type AvatarVisualState = "idle" | "listening" | "speaking";

export type AvatarMode = "normal" | "talk";

interface AvatarSceneProps {
  state: AvatarVisualState;
  mode?: AvatarMode;
}

const PRIMITIVE_SCALE = 1.15;

function CameraController() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 1.4, 2.6);
    camera.lookAt(0, 1.2, 0);
  }, [camera]);

  return null;
}

function AvatarCoreFallback({ state }: { state: AvatarVisualState }) {
  const pulseClass =
    state === "listening"
      ? "from-cyan-300/80 via-sky-400/60 to-violet-400/60"
      : state === "speaking"
        ? "from-violet-300/80 via-fuchsia-400/60 to-cyan-400/60"
        : "from-cyan-200/70 via-sky-300/50 to-indigo-300/50";

  return (
    <div className="relative grid h-full w-full place-items-center overflow-visible rounded-3xl">
      <motion.div
        className={`absolute h-56 w-56 rounded-full bg-gradient-to-r ${pulseClass}`}
        animate={{ opacity: [0.45, 0.78, 0.45], scale: [0.9, 1.06, 0.9] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-36 w-36 rounded-full bg-white/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className={`h-24 w-24 rounded-full bg-gradient-to-br ${pulseClass} shadow-[0_0_45px_rgba(56,189,248,0.45)]`}
        animate={{ y: [0, -6, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

class AvatarErrorBoundary extends Component<
  { children: ReactNode; state: AvatarVisualState },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <AvatarCoreFallback state={this.props.state} />;
    }
    return this.props.children;
  }
}

function Model({
  state,
}: {
  state: AvatarVisualState;
}) {
  const localRef = useRef<Group>(null);
  const emissiveResetRef = useRef<Map<THREE.MeshStandardMaterial, number>>(new Map());
  const { scene } = useGLTF("/models/avatar.glb");

  useFrame((clock) => {
    if (!scene) return;
    if (!localRef.current) return;
    const t = clock.clock.elapsedTime;
    const g = localRef.current;

    if (state === "idle") {
      g.position.y = Math.sin(t * 0.8) * 0.018;
      g.rotation.y = Math.sin(t * 0.38) * 0.012;
      g.rotation.z = Math.sin(t * 0.22) * 0.006;
      g.scale.set(1, 1, 1);
    } else if (state === "listening") {
      g.position.y = Math.sin(t * 0.9) * 0.01;
      g.rotation.y = Math.sin(t * 0.45) * 0.008;
      g.rotation.z = 0;
      g.scale.set(1, 1, 1);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material && !Array.isArray(obj.material)) {
          const m = obj.material as THREE.MeshStandardMaterial;
          if (m.isMeshStandardMaterial) {
            if (!emissiveResetRef.current.has(m)) {
              emissiveResetRef.current.set(m, m.emissiveIntensity);
            }
            m.emissiveIntensity = 0.18 + Math.sin(t * 3) * 0.06;
          }
        }
      });
    } else {
      const pulse = PRIMITIVE_SCALE + Math.sin(t * 5) * 0.02;
      const uniform = pulse / PRIMITIVE_SCALE;
      const lip = 1 + (Math.sin(t * 5.5) * 0.5 + 0.5) * 0.04;
      g.scale.set(uniform, uniform * lip, uniform);
      g.position.y = Math.sin(t * 3.1) * 0.018;
      g.rotation.y = Math.sin(t * 2.6) * 0.028;
      g.rotation.z = Math.sin(t * 2.2) * 0.012;
    }

    if (state !== "listening") {
      emissiveResetRef.current.forEach((intensity, m) => {
        m.emissiveIntensity = intensity;
      });
      emissiveResetRef.current.clear();
    }
  });

  if (!scene) {
    return null;
  }

  return (
    <group ref={localRef} position={[0, -0.8, 0]}>
      <primitive object={scene} scale={1.5} />
    </group>
  );
}

function AvatarSceneInner({ state, mode = "normal" }: AvatarSceneProps) {
  void mode;

  return (
    <AvatarErrorBoundary state={state}>
      <div className="relative h-full w-full">
        <div className="visible absolute inset-0 flex items-center justify-center opacity-100 transition-all duration-500 ease-out">
          <motion.div
            whileHover={undefined}
            className="h-full w-full overflow-visible rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-[220px] w-[220px] rounded-full bg-cyan-400/20 blur-2xl" />
            </div>
            <div className="relative flex h-full w-full items-start justify-center overflow-hidden rounded-2xl">
              <div className="h-full w-full">
                <Canvas
                  className="!block"
                  gl={{ alpha: true }}
                  style={{ width: "100%", height: "100%", pointerEvents: "none" }}
                >
                  <CameraController />
                  <ambientLight intensity={state === "listening" ? 0.62 : 0.5} />
                  <directionalLight position={[2, 3, 2]} intensity={state === "listening" ? 1.15 : 1} />
                  <directionalLight position={[-2, 2, -2]} intensity={0.5} />
                  {state === "listening" ? (
                    <pointLight position={[0.4, 1.2, 1.8]} intensity={0.55} color="#22d3ee" distance={5} />
                  ) : null}
                  <Suspense fallback={null}>
                    <Model state={state} />
                  </Suspense>
                </Canvas>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AvatarErrorBoundary>
  );
}

const AvatarScene = memo(AvatarSceneInner);
export default AvatarScene;
