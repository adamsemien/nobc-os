import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from 'react-email';
import * as React from 'react';

export default function EventCancelledEmail({
  name,
  eventTitle,
  dateStr,
}: {
  name: string;
  eventTitle: string;
  dateStr: string;
}) {
  const firstName = name.split(' ')[0];

  return (
    <Html lang="en">
      <Head />
      <Preview>{eventTitle} has been cancelled.</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>THE NO BAD COMPANY</Text>

          <Text style={headline}>{firstName}, an event has been cancelled.</Text>

          <Text style={paragraph}>
            We&apos;re sorry to share that <strong>{eventTitle}</strong>, scheduled for {dateStr},
            has been cancelled.
          </Text>

          <Text style={paragraph}>
            There&apos;s nothing you need to do - your access for this event has been released.
            If you purchased a ticket, a full refund is on its way - allow a few days to process.
          </Text>

          <Text style={paragraph}>
            We hope to see you at the next one. Keep an eye on your inbox for what&apos;s coming up.
          </Text>

          <Hr style={divider} />

          <Text style={signoff}>- adam &amp; chloe</Text>
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

const paragraph: React.CSSProperties = {
  fontSize: 15,
  lineHeight: '1.75',
  color: '#333',
  margin: '0 0 16px',
};

const divider: React.CSSProperties = {
  borderTop: '1px solid #e8e4dc',
  margin: '40px 0 32px',
};

const signoff: React.CSSProperties = {
  fontSize: 14,
  color: '#666',
  lineHeight: '1.7',
  margin: 0,
};
