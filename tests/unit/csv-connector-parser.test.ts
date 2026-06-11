import { describe, it, expect } from 'vitest';
import { parseCsv, csvToNormalizedContacts } from '@/lib/connectors/csv/parser';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

describe('parseCsv', () => {
  it('parses simple rows (LF, no trailing newline)', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with embedded commas and quotes', () => {
    const text = 'name,note\n"Doe, Jane","She said ""hi"""';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'She said "hi"'],
    ]);
  });

  it('handles newlines inside quoted fields', () => {
    const text = 'a,b\n"line1\nline2",x';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ]);
  });

  it('handles CRLF records and a trailing newline + strips a BOM', () => {
    const text = '﻿a,b\r\n1,2\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('csvToNormalizedContacts', () => {
  it('maps email + first/last and normalizes', () => {
    const csv = 'Email,First Name,Last Name\nJane@Acme.com,Jane,Doe';
    const { contacts, totalRows, skipped } = csvToNormalizedContacts(csv, { fetchedAt });
    expect(totalRows).toBe(1);
    expect(skipped).toEqual([]);
    expect(contacts[0]).toMatchObject({
      source: 'csv',
      email: 'jane@acme.com',
      emailRaw: 'Jane@Acme.com',
      firstName: 'Jane',
      lastName: 'Doe',
      externalId: 'jane@acme.com',
    });
    expect(contacts[0].sourceFetchedAt).toBe(fetchedAt);
  });

  it('splits a single full-name column when no first/last present', () => {
    const { contacts } = csvToNormalizedContacts('name,email\nJane Q Doe,j@x.com', { fetchedAt });
    expect(contacts[0]).toMatchObject({ firstName: 'Jane', lastName: 'Q Doe' });
  });

  it('matches header aliases case/format-insensitively and reports unmapped', () => {
    const csv = 'E-Mail,Mobile,IG,Vibe\nx@y.com,512-555-0100,@handle,cool';
    const { contacts, headerMap, unmappedHeaders } = csvToNormalizedContacts(csv, { fetchedAt });
    expect(headerMap.email).toBe(0);
    expect(headerMap.phone).toBe(1);
    expect(headerMap.instagram).toBe(2);
    expect(unmappedHeaders).toEqual(['Vibe']);
    expect(contacts[0]).toMatchObject({
      phone: '512-555-0100',
      instagram: 'handle', // @ stripped, lowercased
    });
  });

  it('splits a tags column and applies an optional default role', () => {
    const csv = 'email,tags\na@b.com,"vip; founder, host"';
    const { contacts } = csvToNormalizedContacts(csv, { fetchedAt, defaultRole: 'lead' });
    expect(contacts[0].roleHint).toBe('lead');
    expect(contacts[0].tags).toEqual(['vip', 'founder', 'host']);
  });

  it('skips blank lines and rows with no identity or name', () => {
    const csv = 'email,first name,note\n,,just a note\n\nreal@x.com,,';
    const { contacts, totalRows, skipped } = csvToNormalizedContacts(csv, { fetchedAt });
    expect(contacts.map((c) => c.email)).toEqual(['real@x.com']);
    expect(totalRows).toBe(2); // the no-identity row + the real row; blank line ignored
    expect(skipped).toEqual([{ row: 2, reason: 'no email, phone, instagram, or name' }]);
  });

  it('uses explicit id over email for externalId, and keeps the raw row', () => {
    const csv = 'id,email,company\nabc123,a@b.com,Acme';
    const { contacts } = csvToNormalizedContacts(csv, { fetchedAt });
    expect(contacts[0].externalId).toBe('abc123');
    expect(contacts[0].enrichment).toEqual({ companyName: 'Acme' });
    expect(contacts[0].rawSnapshot).toEqual({ id: 'abc123', email: 'a@b.com', company: 'Acme' });
  });

  it('returns empty result for empty input', () => {
    expect(csvToNormalizedContacts('', { fetchedAt })).toMatchObject({
      contacts: [],
      totalRows: 0,
    });
  });
});
