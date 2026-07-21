/**
 * Mocked STT/TTS boundary. Per the assessment scope note, these are treated
 * as black-box functions - real speech infra would sit behind this exact
 * interface without the orchestrator needing to change.
 */

export interface AudioInput {
  raw: string; // stand-in for an audio buffer
}

export interface AudioOutput {
  raw: string; // stand-in for a synthesized audio buffer
}

/** Mocked STT: in a real system this would run a speech-to-text model. */
export function transcribe(audioInput: AudioInput): string {
  return audioInput.raw;
}

/** Mocked TTS: in a real system this would run a text-to-speech model. */
export function synthesize(text: string): AudioOutput {
  return { raw: `[TTS AUDIO]: ${text}` };
}
