import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thenobadcompany.com';

export default function WelcomeEmail({
  name,
  archetype,
}: {
  name: string;
  archetype?: string;
}) {
  const firstName = name.split(' ')[0];

  return (
    <Html lang="en">
      <Head />
      <Preview>you&apos;re in. welcome to no bad company.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>THE NO BAD COMPANY</Text>

          <Text style={headline}>{firstName}, you&apos;re in.</Text>

          {archetype && (
            <Text style={archetypeLabel}>{archetype}</Text>
          )}

          <Text style={paragraph}>
            welcome to no bad company. we&apos;re glad you&apos;re here.
          </Text>

          <Text style={paragraph}>
            keep an eye on upcoming events — we&apos;ll see you there.
          </Text>

          <Button href={`${appUrl}/m/events`} style={cta}>
            see what&apos;s coming up
          </Button>

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

const headline: React.CSSProperties = {
  fontSize: 26,
  lineHeight: '1.3',
  color: '#1a1a1a',
  margin: '0 0 24px',
  fontWeight: 400,
};

const archetypeLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#B22E21',
  margin: '0 0 20px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const paragraph: React.CSSProperties = {
  fontSize: 15,
  lineHeight: '1.75',
  color: '#333',
  margin: '0 0 16px',
};

const cta: React.CSSProperties = {
  backgroundColor: '#B22E21',
  color: '#fff',
  padding: '14px 28px',
  fontSize: 11,
  letterSpacing: '0.18em',
  textDecoration: 'none',
  display: 'inline-block',
  borderRadius: 4,
  textTransform: 'uppercase',
  marginTop: 8,
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
