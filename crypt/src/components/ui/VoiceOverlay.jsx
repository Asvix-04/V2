import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import chatbotApi from '../../lib/chatbotApi';



// ─── Status label map ────────────────────────────────────────────────────────
const STATUS_LABELS = {
    idle: { text: 'Tap the mic to start', color: 'text-white/50' },
    listening: { text: "I'm listening…", color: 'text-red-400' },
    processing: { text: 'Processing…', color: 'text-blue-400' },
    speaking: { text: 'AI is speaking…', color: 'text-green-400' },
    error: { text: '', color: 'text-red-400' },
};

// ─── Main Component ──────────────────────────────────────────────────────────
export function VoiceOverlay({ isOpen, onClose, onVoiceMessage, responseLanguage = null, isIncognito = false, onQuotaExceeded = null }) {
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

        // Strip codec part (e.g., ";codecs=opus") because some backends reject it
        const cleanMimeType = mimeType.split(';')[0];

        try {
            setVoiceStatus('processing');
            const base64Audio = await blobToBase64(blob);

            // Call speech-to-speech endpoint
            const result = await chatbotApi.speechToSpeech(
                base64Audio,
                cleanMimeType,
                responseLanguage,
                !isIncognito
            );

            // Notify parent to add to chat history
            if (onVoiceMessage && result) {
                onVoiceMessage({
                    transcription: result.transcript || '',
                    answer: result.answer || '',
                    audioBase64: result.audio_base64 || null,
                    guestQuota: result.guestQuota || null
                });
            }

            // Play back the AI audio response if provided
            if (result?.audio_base64) {
                const audioData = result.audio_base64;
                const audioMime = result.mime_type || 'audio/wav';
                setVoiceStatus('speaking');
                await playBase64Audio(audioData, audioMime);
            }

            setVoiceStatus('idle');
        } catch (err) {
            console.error('Speech-to-speech error:', err);
            setError(err.response?.data?.detail || 'Failed to process voice. Please try again.');
            setVoiceStatus('error');
            if (err.response?.status === 429 || err.response?.data?.detail === 'guest_quota_exceeded') {
                if (onQuotaExceeded) {
                    onQuotaExceeded();
                }
            }
        }
    }, [responseLanguage, onVoiceMessage, onQuotaExceeded]);

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

                    {/* Visualizer Area (Space for the mic feel) */}
                    <div className="w-full h-1/3 relative flex items-center justify-center">
                        <div className={cn(
                            "w-32 h-32 rounded-full border-2 border-white/10 flex items-center justify-center transition-all duration-500",
                            isListening ? "border-red-500/50 bg-red-500/5" : "bg-white/5"
                        )}>
                            <Mic className={cn("w-12 h-12", isListening ? "text-red-500" : "text-white/20")} />
                        </div>
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
                                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/40'
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
