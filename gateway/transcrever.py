"""Transcribe a WhatsApp voice note using the local multilingual model."""
import os
import sys
import av
from faster_whisper import WhisperModel


def main():
    with av.open(sys.argv[1]) as audio:
        if not audio.streams.audio or not audio.duration or audio.duration > 900 * av.time_base:
            return 2
    model = WhisperModel(os.environ["ATENDA_WHISPER_MODEL"], device="cpu",
                         compute_type="int8", cpu_threads=4, local_files_only=True)
    segments, _ = model.transcribe(sys.argv[1], language="pt", beam_size=2, vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    if not text:
        return 3
    sys.stdout.buffer.write(text[:12000].encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
