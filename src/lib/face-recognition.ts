import * as faceapi from 'face-api.js';

let isModelLoaded = false;

// Weights URL hosted on GitHub for face-api.js model files
const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export async function loadFaceModels() {
  if (isModelLoaded) return;
  try {
    console.log("Loading face-api.js models from CDN...");
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    isModelLoaded = true;
    console.log("face-api.js models loaded successfully.");
  } catch (error) {
    console.error("Failed to load face-api.js models:", error);
    throw error;
  }
}

export async function extractFaceDescriptor(imageSrc: string | HTMLImageElement): Promise<Float32Array | null> {
  await loadFaceModels();
  
  let imgEl: HTMLImageElement;
  if (typeof imageSrc === 'string') {
    imgEl = document.createElement('img');
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = imageSrc;
    await new Promise((resolve, reject) => {
      imgEl.onload = resolve;
      imgEl.onerror = () => reject(new Error(`Failed to load image from: ${imageSrc}`));
    });
  } else {
    imgEl = imageSrc;
  }

  const detection = await faceapi.detectSingleFace(imgEl)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    console.warn("No face detected in the image.");
    return null;
  }
  return detection.descriptor;
}

export async function extractFaceDescriptors(imageSrc: string | HTMLImageElement): Promise<Float32Array[]> {
  await loadFaceModels();
  
  let imgEl: HTMLImageElement;
  if (typeof imageSrc === 'string') {
    imgEl = document.createElement('img');
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = imageSrc;
    await new Promise((resolve, reject) => {
      imgEl.onload = resolve;
      imgEl.onerror = () => reject(new Error(`Failed to load image from: ${imageSrc}`));
    });
  } else {
    imgEl = imageSrc;
  }

  const detections = await faceapi.detectAllFaces(imgEl)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => d.descriptor);
}

export function compareFaces(descriptor1: Float32Array, descriptor2: Float32Array): number {
  return faceapi.euclideanDistance(descriptor1, descriptor2);
}

