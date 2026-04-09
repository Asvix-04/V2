import io
import os
import re
import wave
import base64
import tempfile
import threading
import time
try:
    import winsound
except ImportError:
    winsound = None  # Not available on Linux/macOS
from concurrent.futures import ThreadPoolExecutor, as_completed
from sarvamai import SarvamAI
from utils import SUPPORTED_LANGUAGES, ISO_TO_SARVAM

# Reverse map: code → display name
LANGUAGE_DISPLAY = {v: k.title() for k, v in SUPPORTED_LANGUAGES.items()}


class SarvamClient:
    def __init__(self):
        
        self.api_key = (
            os.environ.get("sarvam_api_key", "").strip()
        )
        if not self.api_key:
            raise ValueError(
                "Sarvam API key not found. Add SARVAM_API_KEY to your .env file."
            )
        self._sdk = SarvamAI(api_subscription_key=self.api_key)

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def detect_language(self, text: str) -> str:
        """Auto-detect language and map to Sarvam-supported BCP-47 code."""
        try:
            from langdetect import detect
            iso_code = detect(text)
            return ISO_TO_SARVAM.get(iso_code, "en-IN")
        except Exception:
            return "en-IN"

    def record_audio(self, seconds: int = 5,sample_rate: int = 16000) -> str:
        """Record from microphone for `seconds` seconds. Returns path to temp WAV file."""
        try:
            import sounddevice as sd
            import scipy.io.wavfile as wavfile
            import numpy as np
        except ImportError:
            raise RuntimeError(
                "sounddevice or scipy not installed. Run: pip install sounddevice scipy"
            )
        print(f"\n Recording for {seconds}s — speak now...")
        audio = sd.rec(
            int(seconds * sample_rate),
            samplerate=sample_rate,
            channels=1,
            dtype="int16",
        )
        sd.wait()
        print("Done recording.")
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        wavfile.write(tmp.name, sample_rate, audio)
        tmp.close()
        return tmp.name

    def speech_to_text(self, audio_path: str) -> tuple:
        """
        Auto-detect language, transcribe and translate to English using saaras:v3.
        Returns (english_transcript: str, detected_language_code: str).
        Falls back to 'en-IN' if detection is unavailable.
        """
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        response = self._sdk.speech_to_text.transcribe(
            file=("audio.wav", audio_bytes, "audio/wav"),
            model="saaras:v3",
            mode="translate",
        )
        transcript = response.transcript
        # saaras:v3 returns the detected source language in language_code
        detected_lang = getattr(response, "language_code", None) or "en-IN"
        return transcript, detected_lang

    def translate(self, text: str, target_language_code: str,
                  source_language_code: str = "en-IN") -> str:
        """Translate text between any two Sarvam-supported language codes.
        Chunks are translated in parallel for lower latency."""
        chunks = self._chunk_text(text, max_chars=1500)

        def _translate_chunk(idx_chunk):
            idx, chunk = idx_chunk
            response = self._sdk.text.translate(
                input=chunk,
                source_language_code=source_language_code,
                target_language_code=target_language_code,
                model="sarvam-translate:v1",
            )
            return idx, response.translated_text

        results = {}
        with ThreadPoolExecutor(max_workers=min(len(chunks), 6)) as pool:
            futures = {pool.submit(_translate_chunk, (i, c)): i for i, c in enumerate(chunks)}
            for fut in as_completed(futures):
                idx, translated = fut.result()
                results[idx] = translated
        return "\n".join(results[i] for i in range(len(chunks)))

    def text_to_speech(self, text: str, language_code: str) -> None:
        """
        Convert text to speech (bulbul:v2).
        Workers fetch all chunks in parallel.  Playback runs on the main
        thread inside the executor context so workers and playback overlap
        — no daemon thread, no Windows audio threading issues.
        """
        chunks = self._chunk_text(self._strip_markdown(text), max_chars=700)
        audio_map = {}
        ready_events = {i: threading.Event() for i in range(len(chunks))}

        def _fetch(idx, chunk):
            try:
                response = self._sdk.text_to_speech.convert(
                    text=chunk,
                    target_language_code=language_code,
                    speaker="arya",
                    pace=1.0,
                    enable_preprocessing=True,
                    model="bulbul:v2",
                )
                audio_map[idx] = base64.b64decode(response.audios[0])
            except Exception as e:
                print(f"  TTS chunk {idx} failed: {e}")
                audio_map[idx] = None
            finally:
                ready_events[idx].set()

        with ThreadPoolExecutor(max_workers=min(len(chunks), 6)) as pool:
            for i, c in enumerate(chunks):
                pool.submit(_fetch, i, c)
            # Play on main thread while workers still run in background
            for idx in range(len(chunks)):
                ready_events[idx].wait()
                if audio_map.get(idx) is not None:
                    try:
                        self._play_wav_bytes(audio_map[idx])
                    except Exception as e:
                        print(f"  Playback chunk {idx} failed: {e}")

    def translate_and_speak(self, text: str, target_language_code: str,
                            source_language_code: str = "en-IN") -> None:
        """
        Fully pipelined translate → TTS per chunk, all chunks in parallel.
        Each worker translates its chunk then immediately fetches TTS audio.
        Playback runs on the main thread inside the executor context so
        workers and playback genuinely overlap — no daemon thread.
        """
        chunks = self._chunk_text(self._strip_markdown(text), max_chars=700)
        audio_map = {}
        ready_events = {i: threading.Event() for i in range(len(chunks))}

        def _translate_then_fetch(idx, chunk):
            try:
                t_resp = self._sdk.text.translate(
                    input=chunk,
                    source_language_code=source_language_code,
                    target_language_code=target_language_code,
                    model="sarvam-translate:v1",
                )
                tts_resp = self._sdk.text_to_speech.convert(
                    text=t_resp.translated_text,
                    target_language_code=target_language_code,
                    speaker="arya",
                    pace=1.0,
                    enable_preprocessing=True,
                    model="bulbul:v2",
                )
                audio_map[idx] = base64.b64decode(tts_resp.audios[0])
            except Exception as e:
                print(f"  Translate+TTS chunk {idx} failed: {e}")
                audio_map[idx] = None
            finally:
                ready_events[idx].set()

        with ThreadPoolExecutor(max_workers=min(len(chunks), 6)) as pool:
            for i, c in enumerate(chunks):
                pool.submit(_translate_then_fetch, i, c)
            # Play on main thread while workers still run in background
            for idx in range(len(chunks)):
                ready_events[idx].wait()
                if audio_map.get(idx) is not None:
                    try:
                        self._play_wav_bytes(audio_map[idx])
                    except Exception as e:
                        print(f"  Playback chunk {idx} failed: {e}")

    def speech_to_text_bytes(self, audio_bytes: bytes, mime_type: str = "audio/wav") -> tuple:
        """
        STT from raw audio bytes (no file I/O).
        Detects language, transcribes and translates to English using saaras:v3.
        Returns (english_transcript: str, detected_language_code: str).
        """
        if not audio_bytes:
            raise ValueError("audio_bytes cannot be empty")
        
        response = self._sdk.speech_to_text.transcribe(
            file=("audio", audio_bytes, mime_type),
            model="saaras:v3",
            mode="translate",
        )
        transcript = (getattr(response, "transcript", "") or "").strip()
        detected_lang = getattr(response, "language_code", None) or "en-IN"
        return transcript, detected_lang

    def text_to_speech_bytes(self, text: str, language_code: str) -> bytes:
        """
        Convert text to speech and return merged WAV bytes (no playback).
        Reuses chunking and markdown stripping from existing flow.
        """
        if not (text or "").strip():
            raise ValueError("text cannot be empty")
        
        language_code = self._normalize_language(language_code)
        cleaned_text = self._strip_markdown(text)
        chunks = self._chunk_text(cleaned_text, max_chars=700)
        audio_map = {}

        def _fetch(idx, chunk):
            response = self._sdk.text_to_speech.convert(
                text=chunk,
                target_language_code=language_code,
                speaker="arya",
                pace=1.0,
                enable_preprocessing=True,
                model="bulbul:v2",
            )
            return idx, base64.b64decode(response.audios[0])

        with ThreadPoolExecutor(max_workers=min(len(chunks), 6)) as pool:
            futures = {pool.submit(_fetch, i, c): i for i, c in enumerate(chunks)}
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    chunk_idx, chunk_bytes = fut.result()
                    audio_map[chunk_idx] = chunk_bytes
                except Exception as e:
                    print(f"  TTS chunk {idx} failed: {e}")
                    raise RuntimeError(f"TTS chunk {idx} failed: {e}") from e

        ordered_audio = [audio_map[i] for i in range(len(chunks)) if audio_map.get(i)]
        if not ordered_audio:
            raise RuntimeError("TTS failed for all chunks")
        return self._merge_wav_chunks(ordered_audio)

    def translate_to_speech_bytes(self, text: str, target_language_code: str,
                                  source_language_code: str = "en-IN") -> bytes:
        """
        Translate English text and return spoken WAV bytes in target language (no playback).
        """
        if not (text or "").strip():
            raise ValueError("text cannot be empty")
        
        target_language_code = self._normalize_language(target_language_code)
        cleaned_text = self._strip_markdown(text)
        chunks = self._chunk_text(cleaned_text, max_chars=700)
        audio_map = {}

        def _translate_then_fetch(idx, chunk):
            t_resp = self._sdk.text.translate(
                input=chunk,
                source_language_code=source_language_code,
                target_language_code=target_language_code,
                model="sarvam-translate:v1",
            )
            tts_resp = self._sdk.text_to_speech.convert(
                text=t_resp.translated_text,
                target_language_code=target_language_code,
                speaker="arya",
                pace=1.0,
                enable_preprocessing=True,
                model="bulbul:v2",
            )
            return idx, base64.b64decode(tts_resp.audios[0])

        with ThreadPoolExecutor(max_workers=min(len(chunks), 6)) as pool:
            futures = {pool.submit(_translate_then_fetch, i, c): i for i, c in enumerate(chunks)}
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    chunk_idx, chunk_bytes = fut.result()
                    audio_map[chunk_idx] = chunk_bytes
                except Exception as e:
                    raise RuntimeError(f"Translate+TTS chunk {idx} failed: {e}") from e

        ordered_audio = [audio_map[i] for i in range(len(chunks)) if audio_map.get(i)]
        if not ordered_audio:
            raise RuntimeError("Translate+TTS failed for all chunks")
        return self._merge_wav_chunks(ordered_audio)

    # ------------------------------------------------------------------ #
    #  Helpers                                                             #
    # ------------------------------------------------------------------ #

    def _normalize_language(self, language_code: str) -> str:
        """Normalize language code; fallback to English if unsupported."""
        code = (language_code or "en-IN").strip()
        return code if code in LANGUAGE_DISPLAY else "en-IN"

    def _merge_wav_chunks(self, wav_chunks: list) -> bytes:
        """Merge multiple WAV byte chunks into a single WAV stream."""
        if not wav_chunks:
            raise ValueError("wav_chunks cannot be empty")
        if len(wav_chunks) == 1:
            return wav_chunks[0]

        merged_frames = []
        framerate = None
        nchannels = None
        sampwidth = None

        for chunk in wav_chunks:
            with wave.open(io.BytesIO(chunk), "rb") as wf:
                if framerate is None:
                    framerate = wf.getframerate()
                    nchannels = wf.getnchannels()
                    sampwidth = wf.getsampwidth()
                merged_frames.append(wf.readframes(wf.getnframes()))

        output = io.BytesIO()
        with wave.open(output, "wb") as out:
            out.setnchannels(nchannels or 1)
            out.setsampwidth(sampwidth or 2)
            out.setframerate(framerate or 16000)
            for frames in merged_frames:
                out.writeframes(frames)
        return output.getvalue()

    def _strip_markdown(self, text: str) -> str:
        """Remove markdown syntax that TTS models read aloud verbatim."""
        # Headings: ## Title → Title
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
        # Bold/italic: **text**, *text*, __text__, _text_
        text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)
        text = re.sub(r'_{1,3}(.+?)_{1,3}', r'\1', text)
        # Code blocks and inline code
        text = re.sub(r'```[\s\S]*?```', '', text)
        text = re.sub(r'`(.+?)`', r'\1', text)
        # Bullet/numbered list markers
        text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
        # Blockquotes and horizontal rules
        text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
        # Links: [text](url) → text  |  Images: ![alt](url) → ''
        text = re.sub(r'\[(.+?)\]\(.*?\)', r'\1', text)
        text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
        # Collapse excess blank lines
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def _play_wav_bytes(self, audio_bytes: bytes) -> None:
        """Play WAV bytes in-memory via sounddevice (no temp files).
        Falls back to winsound temp-file if sounddevice unavailable."""
        try:
            import sounddevice as sd
            import numpy as np
            with wave.open(io.BytesIO(audio_bytes)) as wf:
                framerate  = wf.getframerate()
                n_channels = wf.getnchannels()
                sampwidth  = wf.getsampwidth()
                raw        = wf.readframes(wf.getnframes())
            dtype = {1: np.int8, 2: np.int16, 4: np.int32}.get(sampwidth, np.int16)
            pcm = np.frombuffer(raw, dtype=dtype)
            if n_channels > 1:
                pcm = pcm.reshape(-1, n_channels)
            sd.play(pcm, samplerate=framerate)
            sd.wait()
        except Exception:
            if winsound is None:
                print("  ⚠️ Audio playback not supported on this platform (no sounddevice or winsound)")
                return
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                    f.write(audio_bytes)
                    tmp_path = f.name
                winsound.PlaySound(tmp_path, winsound.SND_FILENAME)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)

    def _chunk_text(self, text: str, max_chars: int) -> list:
        """Split text into chunks of at most max_chars without cutting words."""
        paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        chunks = []
        current = ""

        for para in paragraphs:
            if len(para) > max_chars:
                # Split long paragraph at sentence boundaries
                sentences = re.split(r'(?<=[.।!?])\s+', para)
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_chars:
                        current = (current + " " + sent).strip()
                    else:
                        if current:
                            chunks.append(current)
                        # Hard-truncate sentences longer than limit
                        current = sent[:max_chars]
            else:
                if len(current) + len(para) + 1 <= max_chars:
                    current = (current + "\n" + para).strip()
                else:
                    if current:
                        chunks.append(current)
                    current = para

        if current:
            chunks.append(current)

        return chunks if chunks else [text[:max_chars]]
