import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, Environment, Float } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';
import * as THREE from 'three';

// 3D Bubble Component
const AnimatedBubble = ({ analyzer }) => {
    const meshRef = useRef();
    const materialRef = useRef();

    useFrame((state) => {
        if (!meshRef.current || !analyzer) return;

        // Get audio data
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(dataArray);

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedVolume = average / 255;

        // Animate distortion based on volume
        // Base distortion 0.15 (calm), max ~2.5 (crazy)
        // Speed base 1 (slow), max ~10 (fast)
        const targetDistort = 0.15 + (normalizedVolume * 2.5);
        const targetSpeed = 1 + (normalizedVolume * 10); // Much faster wobble when loud

        // Smoothly interpolate current values to target
        materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.05);
        materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, 0.05);

        // Scale pulse
        const targetScale = 1.0 + (normalizedVolume * 0.4);
        meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);

        // Gentle rotation
        meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    });

    return (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
            <Sphere args={[1.5, 64, 64]} ref={meshRef}>
                <MeshDistortMaterial
                    ref={materialRef}
                    color="#000000" // Black
                    attach="material"
                    distort={0.15}
                    speed={1}
                    roughness={0.1} // Very shiny
                    metalness={1.0} // Fully metallic
                    reflectivity={1}
                    clearcoat={1}
                    clearcoatRoughness={0.1}
                />
            </Sphere>
        </Float>
    );
};

export function VoiceOverlay({ isOpen, onClose }) {
    const [stream, setStream] = useState(null);
    const [analyzer, setAnalyzer] = useState(null);
    const [audioContext, setAudioContext] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            startAudio();
        } else {
            stopAudio();
        }
        return () => stopAudio();
    }, [isOpen]);

    const startAudio = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStream(stream);

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);

            source.connect(analyser);
            analyser.fftSize = 256;

            setAudioContext(audioCtx);
            setAnalyzer(analyser);
            setError(null);
        } catch (err) {
            console.error("Microphone access denied:", err);
            setError("Microphone access denied. Please verify permissions.");
        }
    };

    const stopAudio = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        if (audioContext) {
            audioContext.close();
            setAudioContext(null);
        }
        setAnalyzer(null);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-8 right-8 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                    >
                        <X size={24} />
                    </button>

                    {/* 3D Scene */}
                    <div className="w-full h-2/3 relative">
                        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                            <ambientLight intensity={0.5} />
                            <pointLight position={[10, 10, 10]} intensity={1} />
                            <pointLight position={[-10, -10, -10]} intensity={0.5} color="purple" />

                            {/* Glass-like environment reflections */}
                            <Environment preset="city" />

                            <AnimatedBubble analyzer={analyzer} />
                        </Canvas>
                    </div>

                    {/* Status Text / Instructions */}
                    <div className="mt-8 text-center space-y-4">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Voice Mode Active</h2>
                        {error ? (
                            <p className="text-red-400">{error}</p>
                        ) : (
                            <p className="text-white/60">I'm listening... Say something!</p>
                        )}

                        <div className="flex items-center justify-center gap-4 mt-6">
                            <div className={cn(
                                "flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300",
                                stream ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-white/10 text-white/40"
                            )}>
                                {stream ? <Mic size={32} /> : <MicOff size={32} />}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
