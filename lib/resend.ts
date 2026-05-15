import { Resend } from 'resend';

let _resend: Resend | null = null;

function getInstance(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export const resend = new Proxy({} as Resend, {
  get(_, prop: string | symbol) {
    return Reflect.get(getInstance(), prop);
  },
});
