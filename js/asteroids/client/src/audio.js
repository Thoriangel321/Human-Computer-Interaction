import { gameEvents } from './events.js';
import { audioCtx } from './assets.js';
import { globalAssets } from './main.js';

export function initAudio() {

  function playSound(bufferName) {

    if (audioCtx.state === 'suspended') return; 
    
    const buffer = globalAssets?.audio?.[bufferName];
    if (!buffer) return;


    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  }


  gameEvents.addEventListener('fired', () => playSound('shoot'));
  gameEvents.addEventListener('exploded', () => playSound('explosion'));
  gameEvents.addEventListener('hit', () => playSound('hit'));
}