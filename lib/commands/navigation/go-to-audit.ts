import { registerCommand } from '../registry';

registerCommand({
  id: 'navigation.audit',
  name: 'Go to Audit',
  description: 'Audit event trail',
  keywords: ['log', 'history'],
  group: 'navigation',
  execute: (ctx) => {
    ctx.router.push('/operator/audit');
    ctx.closeCommandPalette();
  },
});
