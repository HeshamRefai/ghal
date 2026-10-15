const API = process.env.NEXT_PUBLIC_GHAL_API ?? 'http://localhost:8787';

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': process.env.NEXT_PUBLIC_PILOT_TENANT ?? '11111111-1111-1111-1111-111111111111',
      'x-user-id': process.env.NEXT_PUBLIC_PILOT_USER ?? '22222222-2222-2222-2222-222222222222',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
