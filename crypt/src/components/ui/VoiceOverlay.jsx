import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, Environment, Float } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as THREE from 'three';
import chatbotApi from '../../lib/chatbotApi';

// ─── 3D Animated Bubble ─────────────────────────────────────────────────────
const AnimatedBubble = ({ analyzer, isSpeaking }) => {
    const meshRef = useRef();
    const materialRef = useRef();

    useFrame((state) => {
        if (!meshRef.current) return;

        let normalizedVolume = 0;

        if (analyzer) {
            const dataArray = new Uint8Array(analyzer.frequencyBinCount);
            analyzer.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            normalizedVolume = average / 255;
        } else if (isSpeaking) {
            // Gentle idle pulse when AI is speaking (no mic input)
            normalizedVolume = 0.3 + Math.sin(state.clock.getElapsedTime() * 3) * 0.2;
        }

        const targetDistort = 0.15 + normalizedVolume * 2.5;
        const targetSpeed = 1 + normalizedVolume * 10;

        materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.05);
        materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, 0.05);

        const targetScale = 1.0 + normalizedVolume * 0.4;
        meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);

        meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    });

    return (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
            <Sphere args={[1.5, 64, 64]} ref={meshRef}>
                <MeshDistortMaterial
                    ref={materialRef}
                    color="#000000"
                    attach="material"
                    distort={0.15}
                    speed={1}
                    roughness={0.1}
                    metalness={1.0}
                    reflectivity={1}
                    clearcoat={1}
                    clearcoatRoughness={0.1}
                />
            </Sphere>
        </Float>
    );
};

// ─── Status label map ────────────────────────────────────────────────────────
const STATUS_LABELS = {
    idle: { text: 'Tap the mic to start', color: 'text-white/50' },
    listening: { text: "I'm listening…", color: 'text-red-400' },
    processing: { text: 'Processing…', color: 'text-blue-400' },
    speaking: { text: 'AI is speaking…', color: 'text-green-400' },
    error: { text: '', color: 'text-red-400' },
};

// ─── Main Component ──────────────────────────────────────────────────────────
export function VoiceOverlay({ isOpen, onClose, onVoiceMessage, responseLanguage = 'en-IN' }) {
    // State
    const [voiceStatus, setVoiceStatus] = useState('idle'); // idle | listening | processing | speaking
    const [error, setError] = useState(null);
    const [micStream, setMicStream] = useState(null);
    const [analyzer, setAnalyzer] = useState(null);

    // Refs
    const audioCtxRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const audioPlayerRef = useRef(null);

    // ── Cleanup on close ──────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) {
            stopEverything();
            setVoiceStatus('idle');
            setError(null);
        }
        return () => stopEverything();
    }, [isOpen]);

    const stopEverything = () => {
        // Stop mic
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            setMicStream(null);
        }
        // Stop recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        // Stop audio playback
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current = null;
        }
        // Close audio context
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        setAnalyzer(null);
    };

    // ── Start recording ───────────────────────────────────────────────────
    const startListening = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setMicStream(stream);

            // Set up analyser for 3D visualisation
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtxRef.current = audioCtx;
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            setAnalyzer(analyser);

            // Set up MediaRecorder
            const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = handleRecordingStop;
            recorder.start();
            setVoiceStatus('listening');
        } catch (err) {
            console.error('Mic error:', err);
            setError('Microphone access denied. Please check permissions.');
            setVoiceStatus('error');
        }
    };

    // ── Stop recording + send to API ──────────────────────────────────────
    const stopListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        // Stop mic tracks
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            setMicStream(null);
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        setAnalyzer(null);
        setVoiceStatus('processing');
    };

    // ── Handle blob → base64 → API → playback ─────────────────────────────
    const handleRecordingStop = useCallback(async () => {
        const mimeType = getSupportedMimeType();
        const blob = new Blob(chunksRef.current, { type: mimeType });

        try {
            // Convert blob to base64
            const base64Audio = await blobToBase64(blob);

            setVoiceStatus('processing');

            // Call speech-to-speech endpoint
            const result = await chatbotApi.speechToSpeech(
                base64Audio,
                mimeType,
                responseLanguage,
                true
            );

            // Notify parent to add to chat history
            if (onVoiceMessage && result) {
                onVoiceMessage({
                    transcription: result.transcription || result.question || '',
                    answer: result.answer || result.text || '',
                    audioBase64: result.audio_base64 || result.audio || null,
                });
            }

            // Play back the AI audio response if provided
            if (result?.audio_base64 || result?.audio) {
                const audioData = result.audio_base64 || result.audio;
                const audioMime = result.mime_type || 'audio/wav';
                setVoiceStatus('speaking');
                await playBase64Audio(audioData, audioMime);
            }

            setVoiceStatus('idle');
        } catch (err) {
            console.error('Speech-to-speech error:', err);
            setError('Failed to process voice. Please try again.');
            setVoiceStatus('error');
        }
    }, [responseLanguage, onVoiceMessage]);

    // ── Helpers ───────────────────────────────────────────────────────────
    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const playBase64Audio = (base64, mimeType = 'audio/wav') => new Promise((resolve) => {
        const byteString = atob(base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const audioBlob = new Blob([ab], { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioPlayerRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(resolve);
    });

    const getSupportedMimeType = () => {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/wav'];
        return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
    };

    const handleMicToggle = () => {
        if (voiceStatus === 'listening') {
            stopListening();
        } else if (voiceStatus === 'idle' || voiceStatus === 'error') {
            startListening();
        }
    };

    const isListening = voiceStatus === 'listening';
    const isProcessing = voiceStatus === 'processing';
    const isSpeaking = voiceStatus === 'speaking';
    const statusInfo = STATUS_LABELS[voiceStatus] || STATUS_LABELS.idle;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md"
                >
                    {/* Close */}
                    <button
                        onClick={onClose}
                        className="absolute top-8 right-8 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                    >
                        <X size={24} />
                    </button>

                    {/* 3D Bubble */}
                    <div className="w-full h-2/3 relative">
                        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                            <ambientLight intensity={0.5} />
                            <pointLight position={[10, 10, 10]} intensity={1} />
                            <pointLight position={[-10, -10, -10]} intensity={0.5} color="purple" />
                            <Environment preset="city" />
                            <AnimatedBubble analyzer={analyzer} isSpeaking={isSpeaking} />
                        </Canvas>
                    </div>

                    {/* Controls */}
                    <div className="mt-4 text-center space-y-4">
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            {isSpeaking ? 'AI is Responding' : 'Voice Mode'}
                        </h2>

                        {error ? (
                            <p className="text-red-400 text-sm max-w-xs">{error}</p>
                        ) : (
                            <p className={cn('text-sm transition-colors', statusInfo.color)}>
                                {statusInfo.text}
                            </p>
                        )}

                        <div className="flex items-center justify-center gap-4 mt-4">
                            <button
                                onClick={handleMicToggle}
                                disabled={isProcessing || isSpeaking}
                                className={cn(
                                    'flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed',
                                    isListening
                                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 animate-pulse scale-110'
                                        : 'bg-white/10 text-white hover:bg-white/20'
                                )}
                            >
                                {isProcessing ? (
                                    <Loader2 size={28} className="animate-spin" />
                                ) : isListening ? (
                                    <MicOff size={28} />
                                ) : (
                                    <Mic size={28} />
                                )}
                            </button>
                        </div>

                        <p className="text-white/30 text-xs mt-2">
                            {isListening ? 'Tap to stop recording' : 'Tap mic to speak'}
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
