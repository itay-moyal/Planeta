// One place for all calls to our server. The Vite proxy makes /api same-origin,
// so the httpOnly login cookie is sent automatically.
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, { method = 'GET', json, body } = {}) {
  const options = { method, headers: {}, body };
  if (json !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new ApiError('אין חיבור לשרת. בדקו את החיבור לרשת ונסו שוב.', 'NETWORK', 0);
  }

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response, handled below
  }
  if (!res.ok) {
    // The server already sends a Hebrew message in data.error.message
    throw new ApiError(data?.error?.message ?? 'אירעה שגיאה. נסו שוב.', data?.error?.code ?? 'UNKNOWN', res.status);
  }
  return data;
}
