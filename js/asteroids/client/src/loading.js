import { loadJson, loadImage, loadAudio } from './assets.js';

export async function loadAll(manifestUrl, onProgress, signal) {

  const manifest = await loadJson(manifestUrl, signal);
  
  const imageKeys = Object.keys(manifest.images || {});
  const audioKeys = Object.keys(manifest.audio || {});
  const totalAssets = imageKeys.length + audioKeys.length;
  
  let loadedAssets = 0;
  const assets = { images: {}, audio: {} };

  if (totalAssets === 0) return assets; 


  const track = async (promise) => {
    const result = await promise;
    loadedAssets++;
    onProgress(loadedAssets / totalAssets);
    return result;
  };


  const imagePromises = imageKeys.map(key => 
    track(loadImage(manifest.images[key], signal))
      .then(img => { assets.images[key] = img; })
  );

  const audioPromises = audioKeys.map(key => 
    track(loadAudio(manifest.audio[key], signal))
      .then(buffer => { assets.audio[key] = buffer; })
  );


  await Promise.all([...imagePromises, ...audioPromises]);

  return assets;
}