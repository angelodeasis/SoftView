/**
 * The sample rate SoftView analyses audio at. 16 kHz (8 kHz Nyquist) is ample for
 * loudness / intensity and keeps the resident PCM small even for feature-length files —
 * see spike R1 in `spikes/README.md`. Chosen over 8 kHz to leave headroom for
 * K-weighting later.
 */
export const AUDIO_ANALYSIS_SAMPLE_RATE = 16000;
