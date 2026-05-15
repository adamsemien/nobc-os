import { Svix } from 'svix';

let _svix: Svix | null = null;

export function getSvix(): Svix | null {
  if (!process.env.SVIX_API_KEY) return null;
  if (!_svix) _svix = new Svix(process.env.SVIX_API_KEY);
  return _svix;
}
