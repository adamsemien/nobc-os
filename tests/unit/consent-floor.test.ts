import { describe, it, expect } from 'vitest';
import { channelIdentifier } from '@/lib/comms/can-send';
import { assertChannelAxisOnly, AccessAxisSuppressionError } from '@/lib/comms/suppression';

// Pins the two pure guarantees of the consent floor (CRM substrate, Phase 1):
//  1. channelIdentifier normalizes the same way suppression writes + canSend reads
//     (email lowercased/trimmed; phone trimmed, case preserved) so a suppression
//     always matches its send-time lookup.
//  2. The LOCKED naming-collision law: an ACCESS-axis concept (Red List / VIP /
//     WatchList PURPLE) can NEVER mint a CHANNEL SuppressionEntry. If this drifts,
//     a VIP flag could silently block messaging — so it is locked here.

describe('channelIdentifier', () => {
  it('lowercases and trims the email identifier', () => {
    expect(channelIdentifier({ email: '  Adam@Example.COM ' }, 'EMAIL')).toBe('adam@example.com');
  });

  it('trims but preserves the phone identifier (E.164, no lowercase)', () => {
    expect(channelIdentifier({ phone: ' +1-555-AAA ' }, 'SMS')).toBe('+1-555-AAA');
  });

  it('returns null when the channel has no destination', () => {
    expect(channelIdentifier({ email: null }, 'EMAIL')).toBeNull();
    expect(channelIdentifier({ phone: '' }, 'SMS')).toBeNull();
    expect(channelIdentifier({}, 'EMAIL')).toBeNull();
  });
});

describe('assertChannelAxisOnly (naming-collision guard)', () => {
  it.each([
    'Red List',
    'red-list',
    'redlisted',
    'VIP',
    'purple',
    'WatchList PURPLE',
    'watch_list',
  ])('refuses an ACCESS-axis source: %s', (label) => {
    expect(() => assertChannelAxisOnly({ source: label })).toThrow(AccessAxisSuppressionError);
  });

  it('refuses ACCESS-axis vocabulary that leaks through the note field', () => {
    expect(() => assertChannelAxisOnly({ source: 'activecampaign', note: 'imported from VIP list' })).toThrow(
      AccessAxisSuppressionError,
    );
  });

  it('allows legitimate CHANNEL-axis provenance', () => {
    expect(() => assertChannelAxisOnly({ source: 'activecampaign' })).not.toThrow();
    expect(() => assertChannelAxisOnly({ source: 'carrier_stop', note: 'Twilio 21610' })).not.toThrow();
    expect(() => assertChannelAxisOnly({})).not.toThrow();
  });
});
