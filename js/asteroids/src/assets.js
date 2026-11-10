export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchWithRetry(url, options = {}, retries = 3) {
  let attempt = 0;
  const baseDelay = 500; 

  while (attempt <= retries) {
    try {
      const response = await fetch(url, options);

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client Error ${response.status}: ${url}`);
      }

      if (!response.ok) {
        throw new Error(`Server Error ${response.status}`);
      }

      return response; 
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error; 
      }
      
      if (attempt === retries) {
        throw new Error(`Failed to fetch ${url} after ${retries} retries: ${error.message}`);
      }


      const backoffDelay = baseDelay * (2 ** attempt);
      const jitter = Math.random() * 200;
      await delay(backoffDelay + jitter);
      
      console.warn(`Retry ${attempt + 1}/${retries} for ${url}...`);
      attempt++;
    }
  }
}

export async function loadJson(url, signal) {
  const response = await fetchWithRetry(url, { signal });
  return await response.json();
}

export function loadImage(url, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    

    const onAbort = () => {
      img.src = ''; 
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);
    }

    img.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(img);
    };
    
    img.onerror = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to load image: ${url}`));
    };
    
    img.src = url;
  });
}


export async function loadAudio(url, signal) {
  const response = await fetchWithRetry(url, { signal });
  const arrayBuffer = await response.arrayBuffer();

  return await audioCtx.decodeAudioData(arrayBuffer);
}