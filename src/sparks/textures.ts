import { DataTexture, LinearFilter, type Texture } from 'three';

/** A white disc whose alpha falls off as `(1 − r)^power`, generated so the package ships no images. */
function radial(size: number, power: number): Texture {
  const center = (size - 1) / 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x - center, y - center) / center);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round((1 - r) ** power * 255);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export const dotTexture = (): Texture => radial(32, 2);

export const glowTexture = (): Texture => radial(64, 2.5);
