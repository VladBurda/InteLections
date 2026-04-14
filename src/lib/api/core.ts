export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: options.body ? (isFormData ? options.body as FormData : JSON.stringify(options.body)) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Network error';
    throw new Error(`Could not reach the InteLections backend. Check whether npm run dev is running and your local integration keys are configured. (${message})`);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function fileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
