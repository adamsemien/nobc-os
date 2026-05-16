import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

export default function DeclineEmail({ name }: { name: string }) {
  const firstName = name.split(' ')[0];

  return (
    <Html lang="en">
      <Head />
      <Preview>your application — no bad company.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>THE NO BAD COMPANY</Text>

          <Text style={paragraph}>{firstName},</Text>

          <Text style={paragraph}>
            we read it carefully. at this moment it&apos;s not the right fit.
            that&apos;s not a judgment — it&apos;s timing and composition.
            thank you for taking the time.
          </Text>

          <Hr style={divider} />

          <Text style={signoff}>— adam &amp; chloe</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#F9F7F2',
  fontFamily: 'Georgia, serif',
  margin: 0,
};

const container: React.CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  padding: '48px 24px',
};

const brand: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.18em',
  color: '#B22E21',
  margin: '0 0 40px',
  textTransform: 'uppercase',
};

const paragraph: React.CSSProperties = {
  fontSize: 15,
  lineHeight: '1.75',
  color: '#333',
  margin: '0 0 16px',
};

const divider: React.CSSProperties = {
  borderColor: '#e8e4dc',
  margin: '40px 0 32px',
};

const signoff: React.CSSProperties = {
  fontSize: 14,
  color: '#666',
  lineHeight: '1.7',
  margin: 0,
};
