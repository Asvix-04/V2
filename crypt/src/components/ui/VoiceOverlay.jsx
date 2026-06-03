import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const normalizeTranscript = (text = '') => text.replace(/\s+/g, ' ').trim();

function getSpeechRecognition() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function mergeTranscriptParts(finalText, interimText) {
    return [finalText, interimText].map(normalizeTranscript).filter(Boolean).join(' ');
}

function LiveWaveform({ levels }) {
    return (
        <div className="flex h-9 flex-1 items-center gap-[3px] overflow-hidden">
            {levels.map((level, index) => (
                <span
                    key={index}
                    className="w-[3px] shrink-0 rounded-full bg-foreground-muted/70 transition-[height] duration-75"
                    style={{ height: `${Math.max(3, Math.round(level * 28))}px` }}
                />
            ))}
        </div>
    );
}

export const VoiceInputBar = forwardRef(function VoiceInputBar({
    onTranscriptSend,
    onClose,
    responseLanguage = null,
}, ref) {
    const [liveTranscript, setLiveTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [fallbackText, setFallbackText] = useState('');
    const [inlineError, setInlineError] = useState(null);
    const [levels, setLevels] = useState(() => Array.from({ length: 96 }, () => 0.08));
    const recognitionRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const interimTranscriptRef = useRef('');
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const animationRef = useRef(null);
    const startedRef = useRef(false);
    const speechSupported = Boolean(getSpeechRecognition());

    const stopAudio = useCallback(() => {}, []);

    useImperativeHandle(ref, () => ({
        stopAudio,
    }), [stopAudio]);

    const stopWaveform = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
    }, []);

    const stopRecognition = useCallback((abort = false) => {
        if (!recognitionRef.current) return;
        try {
            if (abort) recognitionRef.current.abort();
            else recognitionRef.current.stop();
        } catch {
            // Browser speech recognition may already be inactive.
        }
        recognitionRef.current = null;
    }, []);

    const cleanup = useCallback(() => {
        stopRecognition(true);
        stopWaveform();
    }, [stopRecognition, stopWaveform]);

    const startWaveform = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            audioContext.createMediaStreamSource(stream).connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                analyser.getByteFrequencyData(data);
                const nextLevels = Array.from({ length: 96 }, (_, index) => {
                    const sourceIndex = Math.floor((index / 96) * data.length);
                    return Math.min(1, Math.max(0.06, data[sourceIndex] / 190));
                });
                setLevels(nextLevels);
                animationRef.current = requestAnimationFrame(tick);
            };
            tick();
        } catch {
            setInlineError('Microphone access denied. Please allow mic access and try again.');
        }
    }, []);

    const startRecognition = useCallback(() => {
        const SpeechRecognition = getSpeechRecognition();
        if (!SpeechRecognition) {
            setInlineError('Live transcription is not supported in this browser');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        if (responseLanguage) recognition.lang = responseLanguage;

        recognition.onresult = (event) => {
            let finalPart = '';
            let interimPart = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const transcript = event.results[index][0].transcript;
                if (event.results[index].isFinal) finalPart += transcript;
                else interimPart += transcript;
            }
            if (normalizeTranscript(finalPart)) {
                finalTranscriptRef.current = mergeTranscriptParts(finalTranscriptRef.current, finalPart);
            }
            interimTranscriptRef.current = normalizeTranscript(interimPart);
            setLiveTranscript(finalTranscriptRef.current);
            setInterimTranscript(interimTranscriptRef.current);
        };

        recognition.onerror = (event) => {
            if (event.error === 'aborted') return;
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                setInlineError('Microphone access denied. Please allow mic access and try again.');
            } else {
                setInlineError(`Speech recognition error: ${event.error}`);
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (error) {
            setInlineError(error.message || 'Unable to start speech recognition.');
        }
    }, [responseLanguage]);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        queueMicrotask(() => {
            startWaveform();
            startRecognition();
        });
        return cleanup;
    }, [cleanup, startRecognition, startWaveform]);

    const handleCancel = () => {
        cleanup();
        onClose?.();
    };

    const handleSubmit = () => {
        const transcript = speechSupported
            ? mergeTranscriptParts(finalTranscriptRef.current, interimTranscriptRef.current)
            : normalizeTranscript(fallbackText);

        if (!transcript) {
            setInlineError('Nothing was captured, try again');
            return;
        }

        cleanup();
        onTranscriptSend?.(transcript);
        onClose?.();
    };

    const combinedTranscript = mergeTranscriptParts(liveTranscript, interimTranscript);

    return (
        <div className="flex min-h-[72px] w-full flex-1 items-center gap-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                {speechSupported ? (
                    <div className="max-h-16 min-h-7 overflow-y-auto px-1 text-sm leading-relaxed text-foreground">
                        {combinedTranscript ? (
                            <span>
                                {liveTranscript}
                                {interimTranscript && <span className="text-foreground-muted"> {interimTranscript}</span>}
                            </span>
                        ) : (
                            <span className="italic text-foreground-muted">Listening...</span>
                        )}
                    </div>
                ) : (
                    <textarea
                        value={fallbackText}
                        onChange={(event) => setFallbackText(event.target.value)}
                        placeholder="Live transcription is not supported in this browser"
                        className="max-h-16 min-h-7 w-full resize-none bg-transparent px-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-foreground-muted"
                    />
                )}

                <div className="flex items-center">
                    <LiveWaveform levels={levels} />
                </div>

                {inlineError && (
                    <p className="px-1 text-xs text-red-500 dark:text-red-300">{inlineError}</p>
                )}
            </div>

            <button
                type="button"
                onClick={handleCancel}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/5 text-foreground-muted transition-colors hover:bg-black/10 hover:text-foreground dark:bg-white/10 dark:hover:bg-white/15"
                aria-label="Cancel voice input"
            >
                <X size={22} />
            </button>
            <button
                type="button"
                onClick={handleSubmit}
                className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white transition-colors hover:bg-accent-bright',
                    !combinedTranscript && !fallbackText.trim() && 'opacity-80'
                )}
                aria-label="Send voice input"
            >
                <Check size={23} />
            </button>
        </div>
    );
});

export default VoiceInputBar;
