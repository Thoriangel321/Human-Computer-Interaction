export interface LoadedAssets {
  readonly images: ReadonlyMap<string, HTMLImageElement>;
  readonly audio: ReadonlyMap<string, AudioBuffer>;
}

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (sharedAudioCtx === null) {
    sharedAudioCtx = new AudioContext();
  }
  return sharedAudioCtx;
}