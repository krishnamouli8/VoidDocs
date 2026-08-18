export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(text: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(text)
  );
  
  const bundle = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  bundle.set(salt, 0);
  bundle.set(iv, salt.length);
  bundle.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  // Convert to base64 for easy string storage
  let binaryString = "";
  for (let i = 0; i < bundle.byteLength; i++) {
    binaryString += String.fromCharCode(bundle[i]);
  }
  return btoa(binaryString);
}

export async function decryptData(base64Data: string, password: string): Promise<string> {
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);

    const key = await deriveKey(password, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    throw new Error("Decryption failed. Incorrect password or corrupted data.");
  }
}
