'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ARCHETYPES, ARCHETYPE_ORDER, ArchetypeName } from '@/config/archetypes';
import dynamic from 'next/dynamic';

const FroggerGame = dynamic(() => import('./FroggerGame'), { ssr: false });

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

const REACTIONS = ['interesting.', 'noted.', 'love that.', 'makes sense.', 'got it.', 'okay.'];

const THEME = {
  day: {
    bg: 'var(--bg)',
    text: 'var(--text-primary)',
    accent: 'var(--primary)',
    muted: 'var(--text-secondary)',
    border: 'var(--border)',
    tertiary: 'var(--text-tertiary)',
  },
  night: {
    bg: 'var(--bg-night)',
    text: 'var(--text-night)',
    accent: 'var(--accent-night)',
    muted: 'var(--muted-night)',
    border: 'var(--border-night)',
    tertiary: 'var(--tertiary-night)',
  },
  primary: 'var(--primary)',
};

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  neighborhood: string;
  homeAddress: string;
  fromOriginally: string;
  birthday: string;
  links: string;
  referrers: [string, string, string];
  whatYouDo: string;
  howDidYouHear: string;
  workingOn: string;
  obsessedWith: string;
  personYouAdmire: string;
  howDoYouKnowGoodCompany: string;
  connectionOpportunity: string;
  loyalCommunity: string;
  whatKindOfPeopleFlowThrough: string;
  interestingPeople: string;
  detailsRight: string;
  trustTaste: string;
  recommend: string;
  splurgeVsSave: string;
  recommendTravel: string;
  recommendFoodDrink: string;
  recommendWellnessFitness: string;
  recommendFashion: string;
  recommendHomeDesign: string;
  karaokeS: string;
  coffeeTable: string;
  idealSaturday: string;
  sundayMorning: string;
  contentStopsScrolling: string;
  everydayItem: string;
  preferredWorkout: string;
  localAustinBrand: string;
  dreamBrandPartnership: string;
  shoppingCart: string;
  spendMoreThanMost: string;
  topPodcasts: string;
  whatPeopleComeToYouFor: string;
  heavilyInvestedIn: string;
  genuineExpertIn: string;
  photoUrls: string[];
  foodAccessibility: string;
  agreedToTerms: boolean;
  consentSms: boolean;
}

interface SubmitResult {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalizedCopy: string;
}

const EMPTY_FORM: FormData = {
  fullName: '', email: '', phone: '', city: '', neighborhood: '', homeAddress: '',
  fromOriginally: '', birthday: '', links: '', referrers: ['', '', ''],
  whatYouDo: '', howDidYouHear: '',
  workingOn: '', obsessedWith: '', personYouAdmire: '',
  howDoYouKnowGoodCompany: '', connectionOpportunity: '', loyalCommunity: '',
  whatKindOfPeopleFlowThrough: '', interestingPeople: '',
  detailsRight: '', trustTaste: '', recommend: '', splurgeVsSave: '',
  recommendTravel: '', recommendFoodDrink: '', recommendWellnessFitness: '',
  recommendFashion: '', recommendHomeDesign: '',
  karaokeS: '', coffeeTable: '', idealSaturday: '', sundayMorning: '',
  contentStopsScrolling: '', everydayItem: '',
  preferredWorkout: '', localAustinBrand: '', dreamBrandPartnership: '',
  shoppingCart: '', spendMoreThanMost: '', topPodcasts: '',
  whatPeopleComeToYouFor: '', heavilyInvestedIn: '', genuineExpertIn: '',
  photoUrls: [], foodAccessibility: '', agreedToTerms: false, consentSms: false,
};

const TEST_DATA: Partial<FormData> = {
  fullName: 'Jordan Voss',
  email: 'jordan.voss@test.com',
  phone: '512-555-0192',
  city: 'Austin, TX',
  neighborhood: 'East Austin',
  homeAddress: '2541 East 6th Street, Austin, TX 78702',
  fromOriginally: 'Chicago',
  birthday: '1990-04-12',
  links: '@jordanvoss · https://jordanvoss.co · https://linkedin.com/in/jordanvoss',
  referrers: ['Chloe Chiang', 'Adam Semien', ''],
  whatYouDo: 'Building a platform that connects independent restaurateurs with local farmers directly. We cut out three middlemen and the margins are finally making sense.',
  howDidYouHear: 'Through mutual friends in the food community',
  workingOn: 'Building a platform that connects independent restaurateurs with local farmers directly. We cut out three middlemen and the margins are finally making sense.',
  obsessedWith: "The way Tokyo convenience stores have turned functional retail into a genuine cultural experience. I've been thinking about it for six months.",
  personYouAdmire: "My friend Dara who runs a foundation in Lagos and somehow also DJs underground parties in Brooklyn twice a year. The way she holds multiple identities with total ease is something I study.",
  howDoYouKnowGoodCompany: "When the conversation gets inconveniently interesting. When someone says something true and the table just goes quiet for a second.",
  connectionOpportunity: "Introduced a ceramicist I know to a restaurant opening in the Eastside that needed a custom dish program. They're still working together two years later.",
  loyalCommunity: "A small dinner series I've been part of since 2019. It has no name, no Instagram, just twelve people who rotate hosting. It survived the pandemic and I think that says everything.",
  whatKindOfPeopleFlowThrough: "Farmers, chefs, the occasional architect or designer who works on hospitality spaces. People who understand that the supply chain is part of the story.",
  interestingPeople: "My friend Dara runs a foundation in Lagos and somehow also DJs underground parties in Brooklyn twice a year. My neighbor Ray is 74, was a session musician in the 70s, and knows more about fermentation than anyone I've met.",
  detailsRight: 'Barley Swine. The spacing between tables, the way servers describe the food, the fact that the check never feels like an interruption.',
  trustTaste: 'My friend Mei. If she recommends something I stop asking questions and just go.',
  recommend: 'Sourdough starter culture from a bakery in Portland called Seastar. I have personally convinced eleven people to order it.',
  splurgeVsSave: "Splurge on restaurants and travel. Save on everything that doesn't create a memory.",
  recommendTravel: 'Tokyo — the convenience stores alone are worth the flight',
  recommendFoodDrink: 'Barley Swine — always Barley Swine',
  recommendWellnessFitness: 'Daily walks, occasional yoga when I\'m disciplined about it',
  recommendFashion: 'Margaret Howell and vintage Filson',
  recommendHomeDesign: 'Anything Tadao Ando would approve of',
  karaokeS: 'Africa by Toto. Every time.',
  coffeeTable: "Monocle issue from 2019, a rock from Marfa, and a book on Tadao Ando I've never actually opened.",
  idealSaturday: 'Farmers market at 7, two hours of reading, a long lunch with people I want to think with, nothing scheduled after 4pm.',
  sundayMorning: 'Farmers market, then two hours of reading with the phone in another room.',
  contentStopsScrolling: 'Are.na boards. Architecture and urbanism long reads. The occasional deep-dive video essay on fermentation or material culture.',
  everydayItem: 'I was a competitive fencer in college. Épée. I was not very good.',
  preferredWorkout: 'Cycling and occasional yoga',
  localAustinBrand: 'JuiceLand — underrated actually',
  dreamBrandPartnership: 'Muji. The philosophy aligns — everything we make should have a reason.',
  shoppingCart: 'Sourdough starter culture from Seastar in Portland, a Japanese carbon steel knife, and the new Monocle issue',
  spendMoreThanMost: "Restaurants and travel. Save on everything that doesn't create a memory.",
  topPodcasts: '99% Invisible, Gastropod, and How I Built This for the commute',
  whatPeopleComeToYouFor: 'Introductions. And whether a business idea actually has legs. Sometimes both in the same call.',
  heavilyInvestedIn: "The platform — we're finally profitable on the direct sourcing model and I'm putting everything back in.",
  genuineExpertIn: "Agricultural supply chains and the last-mile problem in local food. And probably Tokyo convenience store culture at this point.",
  foodAccessibility: '',
};

const DEMO_SETS: Array<{
  id: string;
  name: string;
  desc: string;
  color: string;
  data: Partial<FormData>;
}> = [
  {
    id: 'maya',
    name: 'Maya Okonkwo',
    desc: 'charter candidate',
    color: '#2D7A4F',
    data: {
      fullName: 'Maya Okonkwo',
      email: 'maya.okonkwo@test.com',
      phone: '512-555-0271',
      city: 'Austin, TX',
      neighborhood: 'East Austin',
      homeAddress: '1840 East 7th Street, Austin, TX 78702',
      fromOriginally: 'Lagos, Nigeria',
      birthday: '1989-08-22',
      links: '@mayaokonkwo · mayaokonkwo.com',
      referrers: ['Chloe Chiang', 'Adam Semien', ''],
      whatYouDo: "Cultural programmer and experience designer — I run a studio that produces site-specific programming for brands trying to reach creative communities without losing the room. Before that, gallery management and event production in London and Lagos.",
      howDidYouHear: 'Through Chloe Chiang',
      workingOn: "Running a cultural programming studio that produces site-specific experiences for brands who want to reach creative communities without being cringe about it. We just wrapped a three-month residency for a beverage brand inside a gallery space in East Austin — no logos on the wall, just programming that earned the room.",
      obsessedWith: "The Nairobi art scene right now and what it means that the best contemporary African art is being bought by Africans. The secondary market implications alone could reshape everything. I've been in contact with two collectors there and it's unlike anything happening in New York.",
      personYouAdmire: "Rirkrit Tiravanija. The way he turned hospitality and shared meals into his primary artistic medium — the idea that gathering people is itself a form of art. I think about it constantly when designing experiences.",
      howDoYouKnowGoodCompany: "When people stop performing and start thinking out loud. When you leave feeling smarter and more curious than when you arrived. When someone says something true at the table and the room just goes still for a second.",
      connectionOpportunity: "Introduced a James Beard-nominated chef to a real estate developer who wanted to do something interesting with a warehouse space. They talked twice, shook hands, and opened a restaurant. It has a three-month waitlist.",
      loyalCommunity: "A rotating dinner series in Brooklyn I've been part of for six years. No name, no social media, 14 people, you eat whatever the host decides. It survived a pandemic and two people moving to different countries.",
      whatKindOfPeopleFlowThrough: "Collectors, curators, independent chefs, creative directors who have crossed over into building real things. People who move between worlds — who can hold a conversation at a gallery opening and at a farmer's market and neither feels forced.",
      interestingPeople: "My mentor who ran the Serpentine Gallery for 12 years — she can read a room in 30 seconds and has never once compromised on quality. My best friend who is a session musician turned VC and is one of the most rigorous thinkers I know.",
      detailsRight: "A record store in Tokyo called Jet Set Records in Shimokitazawa. The way they organize by feel rather than genre. You don't know what you're looking for until you find it.",
      trustTaste: "Issey Miyake, still. The way he thought about the relationship between fabric and the body — utility and beauty as the same thing. I also ask Nobu Matsuhisa for restaurant recs if I'm ever in the same city.",
      recommend: "A small ceramics studio in East Austin that doesn't have an Instagram. I have brought them six commissions personally this year.",
      splurgeVsSave: "Splurge on anything that creates a memory or supports a maker. Save on everything a brand wants you to notice.",
      recommendTravel: 'Shimokitazawa — skip the hotels, rent a house',
      recommendFoodDrink: 'Nairobi Chai House in Westlands',
      recommendWellnessFitness: 'Hot power yoga at Black Swan in East Austin',
      recommendFashion: 'Lemaire and local vintage before anything else',
      recommendHomeDesign: 'Mjölk in Toronto — ships to the US',
      karaokeS: "Killing Me Softly. Every time. No hesitation.",
      coffeeTable: "Three art monographs and a piece of raw amber I bought at a market in Lagos.",
      idealSaturday: "Farmers market at 9, long breakfast with two or three people I want to think with, a museum or gallery in the afternoon with no agenda, a dinner I helped cook somewhere I actually want to be.",
      sundayMorning: "Farmers market, then a long breakfast with people I actually want to talk to.",
      contentStopsScrolling: "Long-form essays on Are.na, independent video essays on YouTube about craft and process — ceramics, architecture, winemaking. The kind of content that makes you feel like you watched a documentary, not a reel.",
      everydayItem: "I was a competitive fencer in college. Épée. I was genuinely good.",
      preferredWorkout: 'Hot yoga, long walks, occasional boxing',
      localAustinBrand: "Antonelli's Cheese Shop",
      dreamBrandPartnership: "Issey Miyake or Aesop — I'd want to design an experience around the philosophy of the brand, not a campaign. Something that lives in a space for three months.",
      shoppingCart: "A Muji floor lamp, a Yixing teapot I found on a ceramics deep-dive, and a book on Pritzker-winning architects I haven't ordered yet",
      spendMoreThanMost: "Travel and dining — I'd rather eat one extraordinary meal than three mediocre ones. And on art, when something moves me.",
      topPodcasts: "99% Invisible, The Long View with Brian Koppelman, and Monocle 24's The Urbanist",
      whatPeopleComeToYouFor: "Who to invite and why. I've become a kind of connector-in-residence for a certain kind of creative in Austin — people call me when they're trying to fill a room, launch something, or figure out who they should meet. Also for honest reads on whether a creative direction is actually good versus just well-executed.",
      heavilyInvestedIn: "Building a cultural programming toolkit that I can license to other cities. The Austin model works — I want to see what it looks like in Detroit, Portland, Lagos. I've been putting 15-hour days into the framework for six months.",
      genuineExpertIn: "Experience design for creative communities. How to build programming that earns its audience instead of buying it. And the West African contemporary art market — specifically the secondary market dynamics post-2020.",
      foodAccessibility: '',
      agreedToTerms: true,
      consentSms: false,
    },
  },
  {
    id: 'derek',
    name: 'Derek Paulson',
    desc: 'worth considering',
    color: '#B86A00',
    data: {
      fullName: 'Derek Paulson',
      email: 'derek.paulson@test.com',
      phone: '512-555-0334',
      city: 'Austin, TX',
      neighborhood: 'South Austin',
      homeAddress: '2201 South 1st Street, Austin, TX 78704',
      fromOriginally: 'Memphis, TN',
      birthday: '1986-11-03',
      links: '@derekpaulson',
      referrers: ['Adam Semien', '', ''],
      whatYouDo: "Chef and restaurateur. I own two restaurants in Austin — both focused on seasonal local sourcing with direct farmer relationships. Also doing some consulting for hospitality groups trying to do sourcing better.",
      howDidYouHear: 'Adam Semien invited me',
      workingOn: "Scaling my second restaurant and figuring out whether I want to open a third. The operations are finally solid. The question is whether I want to spend the next five years doing this again.",
      obsessedWith: "Natural wine and why Austin still doesn't have a truly great bottle shop. Someone needs to do it right.",
      personYouAdmire: "Alice Waters. Not because of the obvious reasons — because she had a vision in 1971 that was genuinely 30 years ahead of the conversation and she never compromised on it. She built the infrastructure to support the idea, not just the idea itself.",
      howDoYouKnowGoodCompany: "When there's substance in the room. Good company means you're learning something, laughing about something real, or building something together — not just being seen somewhere.",
      connectionOpportunity: "Connected a farmer I source from with a chef at another restaurant in town. They have a direct relationship now and both are better for it. That kind of quiet introduction matters more than it looks.",
      loyalCommunity: "The Austin food community. I've been going to the same farmers market for six years and I know most of the vendors by name.",
      whatKindOfPeopleFlowThrough: "Chefs, farmers, winemakers, the occasional sommelier. Some architects and designers. People who make things with their hands and think seriously about what they put into the world.",
      interestingPeople: "My business partner who came from finance and approaches hospitality like an operator. Different instinct than me but it works. My sous chef who grew up in Oaxaca and has more knowledge of technique than anyone I've worked with.",
      detailsRight: "Odd Duck. The sourcing is real, the service knows what they're talking about, and they never make you feel like you need to deserve the experience.",
      trustTaste: "My sommelier. If she's excited about a bottle I trust it completely.",
      recommend: "A natural wine importer called Selection Massale. I've converted most of my industry friends.",
      splurgeVsSave: "Splurge on ingredients and wine. Save on things nobody eats.",
      recommendTravel: 'Copenhagen — specifically for the restaurant scene and the food culture',
      recommendFoodDrink: 'Contigo for patio dining, Barley Swine for the serious meal',
      recommendWellnessFitness: 'Running — nothing complicated',
      recommendFashion: 'Engineered Garments — the workwear line',
      recommendHomeDesign: "Whatever's at the Laguna Gloria gift shop",
      karaokeS: "Don't Stop Believin'. Classic for a reason.",
      coffeeTable: "A book on French bistro culture and a stack of menus from places I've eaten.",
      idealSaturday: "Farmers market at 7am, service at the restaurant for brunch, afternoon off to cook something I've been thinking about, dinner with my family.",
      sundayMorning: "Farmers market, then family breakfast.",
      contentStopsScrolling: "Long food videos — actual technique, actual kitchens. Not content, craft. And the occasional deep read on fermentation science or the economics of independent restaurants.",
      everydayItem: "I ran a half marathon once and hated every mile of it.",
      preferredWorkout: 'Running, 5am before service',
      localAustinBrand: 'Barley Swine — they set the standard here',
      dreamBrandPartnership: "Lodge Cast Iron. Simple, honest, made in Tennessee. I'd want to design a collection of seasonal recipes and give them away, not sell them.",
      shoppingCart: "New carbon steel pans, a fermentation crock, and a book on French charcuterie I keep starting and not finishing",
      spendMoreThanMost: "Ingredients. Quality protein, heritage grains, good fats. Most people save on what they eat — I can't do that.",
      topPodcasts: 'The Dave Chang Show, The Restaurant Guys, and occasionally Gastropod when I have two hours',
      whatPeopleComeToYouFor: "Restaurant recommendations — always. But also honest feedback on whether a hospitality idea will actually work. The question I ask every time is: can you survive Tuesday?",
      heavilyInvestedIn: "Figuring out whether I want to open a third restaurant. The emotional and financial calculus of that decision has been occupying more of my mind than I want to admit.",
      genuineExpertIn: "Seasonal sourcing at scale — how to build the supplier relationships, negotiate the pricing, and design a menu around what actually comes in. Most people can do one of those things. I can do all three at the same time.",
      foodAccessibility: '',
      agreedToTerms: true,
      consentSms: false,
    },
  },
  {
    id: 'tyler',
    name: 'Tyler Brennan',
    desc: 'hard pass',
    color: '#B22E21',
    data: {
      fullName: 'Tyler Brennan',
      email: 'tyler.brennan@test.com',
      phone: '512-555-0198',
      city: 'Austin, TX',
      neighborhood: '',
      homeAddress: '4512 Lamar Boulevard, Austin, TX 78756',
      fromOriginally: 'Austin, TX',
      birthday: '1993-05-17',
      links: 'instagram.com/tylerbrennan',
      referrers: ['', '', ''],
      whatYouDo: "Sales at a tech company. Also doing some consulting on the side when I have time.",
      howDidYouHear: 'Saw it online somewhere',
      workingOn: "Sales at a tech company. Also have a side hustle doing some consulting.",
      obsessedWith: "The Joe Rogan podcast and the NBA.",
      personYouAdmire: "Elon Musk. He built multiple companies and changed entire industries.",
      howDoYouKnowGoodCompany: "When people are fun and not taking themselves too seriously. Good vibes basically.",
      connectionOpportunity: "Introduced two friends at a party once. I think they dated for a while.",
      loyalCommunity: "My friend group I guess. We've known each other since high school.",
      whatKindOfPeopleFlowThrough: "Tech people, sales people, some startup guys. Normal Austin people I guess.",
      interestingPeople: "My college roommate who works at Google. My dad who has been in real estate for 30 years.",
      detailsRight: "Uchi is pretty good. The service is always solid.",
      trustTaste: "My friend Jake has pretty good taste.",
      recommend: "The Joe Rogan podcast. Everyone should listen to it.",
      splurgeVsSave: "Splurge on going out. Save on random stuff.",
      recommendTravel: 'Nashville — good nightlife',
      recommendFoodDrink: 'Uchi is the obvious answer',
      recommendWellnessFitness: 'CrossFit or the gym',
      recommendFashion: 'Nothing specific',
      recommendHomeDesign: "Whatever looks good on Instagram",
      karaokeS: "Mr. Brightside.",
      coffeeTable: "Some magazines and a candle.",
      idealSaturday: "Sleep in, brunch somewhere, watch the game, go out at night.",
      sundayMorning: "Sleep in and watch sports.",
      contentStopsScrolling: "Highlight reels, podcasts, anything NBA. Instagram mostly.",
      everydayItem: "I used to be pretty into CrossFit.",
      preferredWorkout: 'Used to do CrossFit, now just the gym',
      localAustinBrand: "I don't really know local brands",
      dreamBrandPartnership: 'Nike or something big like that',
      shoppingCart: "Nothing specific, just random stuff",
      spendMoreThanMost: "Going out and concerts",
      topPodcasts: 'Joe Rogan and Call Her Daddy',
      whatPeopleComeToYouFor: "Hanging out and advice about tech jobs. Sometimes they want restaurant recs.",
      heavilyInvestedIn: "Working on my career and trying to figure out the next move. Maybe doing my own thing eventually.",
      genuineExpertIn: "Sales, honestly. I'm pretty good at it. And knowing Austin nightlife.",
      foodAccessibility: '',
      agreedToTerms: true,
      consentSms: false,
    },
  },
];

const DEMO_DATA: FormData = {
  fullName: 'Jordan Mercer',
  email: 'jordan@example.com',
  phone: '5125550142',
  city: 'Austin, TX',
  neighborhood: 'Travis Heights',
  homeAddress: '1834 South Lamar Blvd, Austin, TX 78704',
  fromOriginally: 'Chicago',
  birthday: '1991-03-14',
  links: 'instagram.com/jordanmercer · jordanmercer.co',
  referrers: ['Chloe Chiang', 'Adam Semien', ''],
  whatYouDo: 'Building a hospitality tech platform for independent venues — connecting operators with tools they actually need. Before that, event production and community building in Austin for five years.',
  howDidYouHear: 'Through Chloe Chiang',
  workingOn: 'Building a hospitality tech platform for independent venues',
  obsessedWith: 'The intersection of food culture and community organizing',
  personYouAdmire: "Virgil Abloh — not just for the aesthetic, but for how he moved between worlds without losing credibility in any of them. He proved you could be a serious designer and a collaborator and a community builder simultaneously.",
  howDoYouKnowGoodCompany: "When the conversation keeps going after the reason you came is over. When you leave thinking differently than when you arrived.",
  connectionOpportunity: "Introduced two founders at a dinner I hosted — they started a company six months later. The introduction was entirely a hunch. Still proud of it.",
  loyalCommunity: 'The Austin food community — been going to the same farmers market for four years',
  whatKindOfPeopleFlowThrough: "Operators, chefs, creative directors, builders. People who are making something real rather than positioning for something.",
  interestingPeople: 'My mentor who runs three Michelin restaurants and my friend who left Goldman to open a natural wine bar',
  detailsRight: 'Uchi Austin — the lighting, the pacing, the way they handle dietary needs without making it weird',
  trustTaste: "My friend Sasha — she has never recommended anything I didn't love",
  recommend: 'The podcast 99% Invisible — I have converted at least 20 people',
  splurgeVsSave: 'Splurge on experiences and ingredients, save on things nobody sees',
  recommendTravel: 'Mexico City — always',
  recommendFoodDrink: 'Suerte for the corn, Odd Duck for the sourcing',
  recommendWellnessFitness: 'Orange Theory followed by walking everywhere',
  recommendFashion: 'Aritzia for the basics, vintage for everything interesting',
  recommendHomeDesign: "Crate & Barrel for bones, thrift stores for character",
  karaokeS: 'Jealous by Beyoncé, no hesitation',
  coffeeTable: 'A Noma coffee table book and a deck of Oblique Strategies cards',
  idealSaturday: "Farmers market at 9, no agenda until noon, then a long lunch somewhere I've been wanting to try, afternoon walking, dinner I cooked myself.",
  sundayMorning: 'Farmers market then a long breakfast with no agenda',
  contentStopsScrolling: "99% Invisible episodes, Are.na boards on architecture and identity, long essays on food culture. Anything that makes me feel like I learned something instead of just consuming something.",
  everydayItem: 'I competed in junior fencing nationals',
  preferredWorkout: 'Orange Theory, three times a week',
  localAustinBrand: "Antonelli's Cheese Shop — the standard for what a local food business can be",
  dreamBrandPartnership: "Patagonia — I'd want to co-design a program around independent venue sustainability, not a product.",
  shoppingCart: "A Le Creuset Dutch oven, a pair of Clarks desert boots in brown, and a book on cocktail history I've been meaning to read for eight months",
  spendMoreThanMost: "Experiences and ingredients. If it creates a memory or goes into something I'm making, I spend without much thought.",
  topPodcasts: "99% Invisible, The Long View with Brian Koppelman, and Conan O'Brien Needs a Friend for the commute",
  whatPeopleComeToYouFor: "Introductions and reads on whether a concept has legs. I've developed a reputation as someone who can tell you in ten minutes whether an idea will work or whether it's a funded wish.",
  heavilyInvestedIn: "The platform — two years in, and the product is finally doing what I've been describing to investors for 18 months. Also: learning how to manage a team without losing the thing that made the work good.",
  genuineExpertIn: "Independent venue operations — the economics, the programming, the community dynamics. And the hospitality-to-tech translation problem, which is harder than most people realize.",
  photoUrls: [],
  foodAccessibility: '',
  agreedToTerms: true,
  consentSms: false,
};

const SCREEN_CONFIG = [
  { label: '', heading: '' },
  { label: 'YOUR WORLD', heading: 'Personality & Perspective' },
  { label: 'YOUR WORLD', heading: 'Community Fit' },
  { label: 'YOUR TASTE', heading: 'Taste' },
  { label: 'YOUR ENERGY', heading: 'Rapid Fire' },
  { label: 'TELL US ABOUT YOU', heading: 'Tell Us About You' },
  { label: 'YOUR PRESENCE', heading: 'Photos' },
  { label: 'THE FINE PRINT', heading: 'Almost There' },
  { label: 'YOUR ARCHETYPE', heading: '' },
];

function stepFromAnswers(answers: Record<string, string>): number {
  if (answers['photos.foodAccessibility'] !== undefined || answers['photos.urls'] !== undefined) return 7;
  if (answers['about.whatPeopleComeToYouFor'] !== undefined) return 6;
  if (answers['rapid.karaokeS'] !== undefined) return 5;
  if (answers['taste.detailsRight'] !== undefined) return 4;
  if (answers['community.howDoYouKnowGoodCompany'] !== undefined || answers['world.interestingPeople'] !== undefined) return 3;
  if (answers['personality.workingOn'] !== undefined || answers['real.workingOn'] !== undefined) return 2;
  if (answers['basics.city'] !== undefined) return 1;
  return 0;
}

export default function MembershipForm() {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV === 'development' || searchParams.get('dev') === 'true';
  const isDemo = searchParams.get('demo') === 'true';

  const [isNight, setIsNight] = useState(false);
  const [step, setStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [data, setData] = useState<FormData>(EMPTY_FORM);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [microReaction, setMicroReaction] = useState('');
  const [showReaction, setShowReaction] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [showFrogger, setShowFrogger] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [testDataLoaded, setTestDataLoaded] = useState(false);
  const [devHovered, setDevHovered] = useState(false);
  const [showDevPicker, setShowDevPicker] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [bannerFading, setBannerFading] = useState(false);

  const froggerBuffer = useRef('');

  const theme = isNight ? THEME.night : THEME.day;

  useEffect(() => {
    const stored = localStorage.getItem('nobc-apply-theme');
    if (stored === 'night') { setIsNight(true); return; }
    if (stored === 'day') return;
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 4) setIsNight(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('nobc-apply-theme', isNight ? 'night' : 'day');
  }, [isNight]);

  const labelStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: 500,
    color: theme.muted,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 0,
    display: 'block',
  };

  function getInputStyle(id: string): React.CSSProperties {
    return {
      background: 'transparent',
      border: 'none',
      borderBottom: `1px solid ${focusedField === id ? theme.accent : theme.border}`,
      borderRadius: 0,
      padding: '8px 0 12px 0',
      fontSize: 16,
      fontFamily: bodyFont,
      color: theme.text,
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
      caretColor: theme.accent,
      transition: 'border-color 200ms ease',
    };
  }

  function getTextareaStyle(id: string): React.CSSProperties {
    return { ...getInputStyle(id), resize: 'none', minHeight: 48, overflow: 'hidden' };
  }

  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.max(48, el.scrollHeight) + 'px';
  }

  const chapterLabelStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: 500,
    color: theme.accent,
    letterSpacing: '0.12em',
    marginBottom: 8,
    display: 'block',
    textTransform: 'uppercase',
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 28,
    fontWeight: 500,
    lineHeight: 1.2,
    color: theme.text,
    margin: '0 0 40px 0',
  };

  const fieldGroup: React.CSSProperties = { marginBottom: 40 };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setShowFrogger(false); return; }
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      froggerBuffer.current = (froggerBuffer.current + e.key.toLowerCase()).slice(-7);
      if (froggerBuffer.current === 'frogger') {
        setShowFrogger(true);
        froggerBuffer.current = '';
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || isDemo || isDev) return;
    (async () => {
      try {
        const res = await fetch(`/api/apply/membership/${id}`);
        if (!res.ok) return;
        const { application, answers } = await res.json();
        setApplicationId(id);
        const ans: Record<string, string> = answers ?? {};
        setData(prev => ({
          ...prev,
          fullName: application.fullName ?? '',
          email: application.email ?? '',
          phone: application.phone ?? '',
          city: ans['basics.city'] ?? '',
          neighborhood: ans['basics.neighborhood'] ?? '',
          homeAddress: ans['basics.homeAddress'] ?? '',
          fromOriginally: ans['basics.fromOriginally'] ?? '',
          birthday: ans['basics.birthday'] ?? '',
          links: ans['basics.links'] ?? '',
          referrers: JSON.parse(ans['basics.referrers'] ?? '["","",""]'),
          whatYouDo: ans['basics.whatYouDo'] ?? '',
          howDidYouHear: ans['basics.howDidYouHear'] ?? '',
          workingOn: ans['personality.workingOn'] ?? ans['real.workingOn'] ?? '',
          obsessedWith: ans['personality.obsessedWith'] ?? ans['real.obsessedWith'] ?? '',
          personYouAdmire: ans['personality.personYouAdmire'] ?? '',
          howDoYouKnowGoodCompany: ans['community.howDoYouKnowGoodCompany'] ?? '',
          connectionOpportunity: ans['community.connectionOpportunity'] ?? ans['world.connectedPeople'] ?? '',
          loyalCommunity: ans['community.loyalCommunity'] ?? ans['world.loyalCommunity'] ?? '',
          whatKindOfPeopleFlowThrough: ans['community.whatKindOfPeopleFlowThrough'] ?? '',
          interestingPeople: ans['community.interestingPeople'] ?? ans['world.interestingPeople'] ?? '',
          detailsRight: ans['taste.detailsRight'] ?? '',
          trustTaste: ans['taste.trustTaste'] ?? '',
          recommend: ans['taste.recommend'] ?? '',
          splurgeVsSave: ans['taste.splurgeVsSave'] ?? '',
          recommendTravel: ans['taste.recommendTravel'] ?? '',
          recommendFoodDrink: ans['taste.recommendFoodDrink'] ?? '',
          recommendWellnessFitness: ans['taste.recommendWellnessFitness'] ?? '',
          recommendFashion: ans['taste.recommendFashion'] ?? '',
          recommendHomeDesign: ans['taste.recommendHomeDesign'] ?? '',
          karaokeS: ans['rapid.karaokeS'] ?? '',
          coffeeTable: ans['rapid.coffeeTable'] ?? '',
          idealSaturday: ans['rapid.idealSaturday'] ?? '',
          sundayMorning: ans['rapid.sundayMorning'] ?? '',
          contentStopsScrolling: ans['rapid.contentStopsScrolling'] ?? ans['rapid.socialLink'] ?? '',
          everydayItem: ans['rapid.everydayItem'] ?? '',
          preferredWorkout: ans['rapid.preferredWorkout'] ?? '',
          localAustinBrand: ans['rapid.localAustinBrand'] ?? '',
          dreamBrandPartnership: ans['rapid.dreamBrandPartnership'] ?? '',
          shoppingCart: ans['rapid.shoppingCart'] ?? '',
          spendMoreThanMost: ans['rapid.spendMoreThanMost'] ?? '',
          topPodcasts: ans['rapid.topPodcasts'] ?? '',
          whatPeopleComeToYouFor: ans['about.whatPeopleComeToYouFor'] ?? ans['real.alwaysCalledAbout'] ?? '',
          heavilyInvestedIn: ans['about.heavilyInvestedIn'] ?? '',
          genuineExpertIn: ans['about.genuineExpertIn'] ?? '',
          foodAccessibility: ans['photos.foodAccessibility'] ?? '',
          photoUrls: JSON.parse(ans['photos.urls'] ?? '[]'),
        }));
        setStep(stepFromAnswers(ans));
        setShowResumeBanner(true);
      } catch { /* start fresh */ }
    })();
  }, [searchParams, isDemo]);

  useEffect(() => {
    if (!showResumeBanner) return;
    const fadeTimer = setTimeout(() => setBannerFading(true), 2500);
    const hideTimer = setTimeout(() => {
      setShowResumeBanner(false);
      setBannerFading(false);
    }, 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [showResumeBanner]);

  useEffect(() => {
    return () => { photoPreviewUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, [photoPreviewUrls]);

  useEffect(() => {
    if (!isDemo) return;
    setData(DEMO_DATA);
  }, [isDemo]);

  const showMicroReaction = useCallback(() => {
    setMicroReaction(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]);
    setShowReaction(true);
    setTimeout(() => setShowReaction(false), 1800);
  }, []);

  const advance = useCallback((nextStep: number) => {
    setIsTransitioning(true);
    setTransitionDirection(nextStep > step ? 'forward' : 'backward');
    setTimeout(() => {
      setStep(nextStep);
      setIsTransitioning(false);
      showMicroReaction();
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 400);
  }, [showMicroReaction, step]);

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  function fillTestData() {
    setData(prev => ({ ...prev, ...TEST_DATA }));
    setTestDataLoaded(true);
    setTimeout(() => setTestDataLoaded(false), 2000);
  }

  async function handleSaveDraft() {
    const answers: Record<string, string> = {
      'basics.city': data.city,
      'basics.neighborhood': data.neighborhood,
      'basics.homeAddress': data.homeAddress,
      'basics.fromOriginally': data.fromOriginally,
      'basics.birthday': data.birthday,
      'basics.links': data.links,
      'basics.referrers': JSON.stringify(data.referrers),
      'basics.whatYouDo': data.whatYouDo,
      'basics.howDidYouHear': data.howDidYouHear,
      'personality.workingOn': data.workingOn,
      'personality.obsessedWith': data.obsessedWith,
      'personality.personYouAdmire': data.personYouAdmire,
      'community.howDoYouKnowGoodCompany': data.howDoYouKnowGoodCompany,
      'community.connectionOpportunity': data.connectionOpportunity,
      'community.loyalCommunity': data.loyalCommunity,
      'community.whatKindOfPeopleFlowThrough': data.whatKindOfPeopleFlowThrough,
      'community.interestingPeople': data.interestingPeople,
      'taste.detailsRight': data.detailsRight,
      'taste.trustTaste': data.trustTaste,
      'taste.recommend': data.recommend,
      'taste.splurgeVsSave': data.splurgeVsSave,
      'taste.recommendTravel': data.recommendTravel,
      'taste.recommendFoodDrink': data.recommendFoodDrink,
      'taste.recommendWellnessFitness': data.recommendWellnessFitness,
      'taste.recommendFashion': data.recommendFashion,
      'taste.recommendHomeDesign': data.recommendHomeDesign,
      'rapid.karaokeS': data.karaokeS,
      'rapid.coffeeTable': data.coffeeTable,
      'rapid.idealSaturday': data.idealSaturday,
      'rapid.sundayMorning': data.sundayMorning,
      'rapid.contentStopsScrolling': data.contentStopsScrolling,
      'rapid.everydayItem': data.everydayItem,
      'rapid.preferredWorkout': data.preferredWorkout,
      'rapid.localAustinBrand': data.localAustinBrand,
      'rapid.dreamBrandPartnership': data.dreamBrandPartnership,
      'rapid.shoppingCart': data.shoppingCart,
      'rapid.spendMoreThanMost': data.spendMoreThanMost,
      'rapid.topPodcasts': data.topPodcasts,
      'about.whatPeopleComeToYouFor': data.whatPeopleComeToYouFor,
      'about.heavilyInvestedIn': data.heavilyInvestedIn,
      'about.genuineExpertIn': data.genuineExpertIn,
      'photos.foodAccessibility': data.foodAccessibility,
    };
    try {
      if (!applicationId) {
        if (!data.fullName.trim() || !data.email.trim()) return;
        const res = await fetch('/api/apply/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: data.fullName, email: data.email, phone: data.phone, answers }),
        });
        if (res.ok) {
          const { id } = await res.json();
          setApplicationId(id as string);
          window.history.replaceState(null, '', '?id=' + id);
        }
      } else {
        await fetch(`/api/apply/membership/${applicationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
      }
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch { /* silent */ }
  }

  async function handleBasicsNext() {
    if (!isDemo && (!data.fullName.trim() || !data.email.trim())) {
      setError('Please fill in your full name and email.');
      return;
    }
    if (!isDemo && !data.whatYouDo.trim()) {
      setError('Please tell us what you do.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/apply/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: data.fullName, email: data.email, phone: data.phone,
          answers: {
            'basics.city': data.city,
            'basics.neighborhood': data.neighborhood,
            'basics.homeAddress': data.homeAddress,
            'basics.fromOriginally': data.fromOriginally,
            'basics.birthday': data.birthday,
            'basics.links': data.links,
            'basics.referrers': JSON.stringify(data.referrers),
            'basics.whatYouDo': data.whatYouDo,
            'basics.howDidYouHear': data.howDidYouHear,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to save application.');
      const { id } = await res.json();
      setApplicationId(id as string);
      const newUrl = isDemo ? `?id=${id}&demo=true` : isDev ? `?id=${id}&dev=true` : `?id=${id}`;
      window.history.replaceState(null, '', newUrl);
      advance(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  async function patchAndAdvance(answers: Record<string, string>, nextStep: number) {
    setIsLoading(true);
    let id = applicationId;
    try {
      if (!id) {
        const res = await fetch('/api/apply/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: data.fullName, email: data.email, phone: data.phone, answers }),
        });
        if (res.ok) {
          const result = await res.json();
          id = result.id as string;
          setApplicationId(id);
          const newUrl = isDemo ? `?id=${id}&demo=true` : isDev ? `?id=${id}&dev=true` : `?id=${id}`;
          window.history.replaceState(null, '', newUrl);
        }
      } else {
        await fetch(`/api/apply/membership/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
      }
    } catch { /* silent */ }
    setIsLoading(false);
    advance(nextStep);
  }

  async function handleSubmit() {
    if (!data.agreedToTerms || !applicationId) return;
    setError('');
    setIsLoading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of photoFiles) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch('/api/apply/membership/upload', { method: 'POST', body: fd });
          uploadedUrls.push(r.ok ? (await r.json()).url : '');
        } catch { uploadedUrls.push(''); }
      }

      const patchRes = await fetch(`/api/apply/membership/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentEmail: true, consentSms: data.consentSms,
          answers: { 'photos.urls': JSON.stringify(uploadedUrls), 'photos.foodAccessibility': data.foodAccessibility },
        }),
      });
      if (!patchRes.ok) throw new Error('Failed to save consent.');

      const submitRes = await fetch(`/api/apply/membership/${applicationId}/submit`, { method: 'POST' });
      if (!submitRes.ok) throw new Error('Failed to submit application.');
      const result = await submitRes.json();
      setSubmitResult(result);
      setData(prev => ({ ...prev, photoUrls: uploadedUrls }));
      setStep(8);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  function generateShareCard() {
    if (!submitResult) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.fillStyle = '#ffffff';
    ctx.font = '500 18px Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.2em';
    ctx.fillText('THE NO BAD COMPANY', 540, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 140px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(submitResult.archetype, 540, 520);

    const oneLiner = ARCHETYPES[submitResult.archetype as ArchetypeName]?.oneLiner ?? '';
    ctx.font = '32px Helvetica Neue, Arial, sans-serif';
    ctx.fillStyle = '#9e9a9a';
    ctx.fillText(oneLiner, 540, 600);

    const topTags = (submitResult.tags ?? []).slice(0, 2);
    if (topTags.length > 0) {
      ctx.fillStyle = '#B22E21';
      ctx.font = '500 24px Helvetica Neue, Arial, sans-serif';
      ctx.fillText(topTags.join('  ·  ').toUpperCase(), 540, 900);
    }

    ctx.fillStyle = '#666666';
    ctx.font = '16px Helvetica Neue, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('nobc-os.vercel.app/apply', 1040, 1040);

    const safeName = data.fullName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'member';
    const link = document.createElement('a');
    link.download = `my-archetype-${safeName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function navBlock(onNext: () => void, nextLabel = 'continue →', nextDisabled = false) {
    return (
      <div style={{ marginTop: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <button onClick={handleSaveDraft} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: bodyFont, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: draftSaved ? theme.accent : theme.muted, opacity: draftSaved ? 1 : 0.5, transition: 'color 200ms, opacity 200ms' }}>
            {draftSaved ? 'saved.' : 'save draft'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {step > 0 ? (
            <button onClick={() => { setIsTransitioning(true); setTransitionDirection('backward'); setTimeout(() => { setStep(s => Math.max(0, s - 1)); setIsTransitioning(false); window.scrollTo({ top: 0, behavior: 'instant' }); }, 400); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: bodyFont, fontSize: 22, color: theme.muted, padding: '8px 0', minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', lineHeight: 1 }}
              aria-label="Go back">
              &#8249;
            </button>
          ) : <div />}
          <button
            style={{
              background: nextDisabled || isLoading ? theme.border : theme.accent,
              color: nextDisabled || isLoading ? theme.muted : '#ffffff',
              border: 'none',
              borderRadius: 0,
              padding: '0 32px',
              height: 52,
              fontSize: 14,
              fontFamily: bodyFont,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: nextDisabled || isLoading ? 'not-allowed' : 'pointer',
              width: '100%',
              maxWidth: 400,
              transition: 'opacity 150ms ease',
            }}
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            onMouseEnter={e => { if (!nextDisabled && !isLoading) (e.target as HTMLElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1'; }}
          >
            {isLoading ? '...' : nextLabel}
          </button>
        </div>
      </div>
    );
  }

  const archetypeData = submitResult ? ARCHETYPES[submitResult.archetype as ArchetypeName] : null;
  const dayStory = archetypeData?.dayStory ?? '';
  const nightStory = archetypeData?.nightStory ?? '';
  const personalizedStory = submitResult?.personalizedCopy || dayStory;

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes barGrow {
          from { width: 0; }
        }
      `}</style>
      <div style={{ background: theme.bg, minHeight: '100vh', fontFamily: bodyFont, color: theme.text, transition: 'background 300ms ease, color 300ms ease' }}>

      {/* DEMO badge */}
      {isDemo && step < 8 && (
        <div style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 100,
          background: theme.accent,
          color: '#ffffff',
          fontSize: 10,
          fontFamily: bodyFont,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '4px 10px',
          borderRadius: 0,
        }}>
          DEMO
        </div>
      )}

      {/* Progress bar */}
      {step < 8 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60, height: 2, background: theme.border }}>
          <div style={{ height: '100%', width: `${((step + 1) / 8) * 100}%`, background: theme.accent, transition: 'width 0.4s ease', borderRadius: 0 }} />
        </div>
      )}

      {/* Resume banner */}
      {showResumeBanner && (
        <div
          onClick={() => setShowResumeBanner(false)}
          style={{
            position: 'fixed', top: 2, left: 0, right: 0, zIndex: 61,
            background: theme.accent, color: '#fff',
            textAlign: 'center', padding: '8px 16px',
            fontFamily: bodyFont, fontSize: 12, cursor: 'pointer',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            opacity: bannerFading ? 0 : 1,
            transition: 'opacity 0.5s ease',
          }}
        >
          Welcome back. Your draft is saved. <span style={{ opacity: 0.7, marginLeft: 8 }}>&times;</span>
        </div>
      )}

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, left: 0, right: 0, zIndex: 50,
        height: 56, padding: '0 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: theme.bg,
      }}>
        <Link href="/" style={{ fontFamily: displayFont, fontSize: 15, fontWeight: 400, fontStyle: 'italic', color: theme.accent, textDecoration: 'none', letterSpacing: '0.02em' }}>The No Bad Company</Link>
        <button onClick={() => setIsNight(n => !n)} style={{
          background: 'none',
          border: `1px solid ${theme.border}`,
          borderRadius: 0,
          cursor: 'pointer',
          fontSize: 14,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'border-color 200ms ease',
        }}>
          <span style={{ opacity: isNight ? 0.4 : 1, transition: 'opacity 200ms ease', fontSize: 13 }}>&#9728;&#65039;</span>
          <span style={{ opacity: isNight ? 1 : 0.4, transition: 'opacity 200ms ease', fontSize: 13 }}>&#127769;</span>
        </button>
      </nav>

      {/* Micro reaction */}
      <div style={{ position: 'fixed', top: 72, left: 0, right: 0, zIndex: 48, display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: showReaction ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <span style={{ fontFamily: displayFont, fontSize: 16, color: theme.accent, fontStyle: 'italic' }}>{microReaction}</span>
      </div>

      <main style={{
        minHeight: 'calc(100vh - 56px)',
        color: theme.text,
        padding: step === 0 || step === 8 ? '0' : '60px 24px 100px 24px',
        transform: isTransitioning ? (transitionDirection === 'forward' ? 'translateY(-100%)' : 'translateY(100%)') : 'translateY(0)',
        opacity: isTransitioning ? 0 : 1,
        transition: 'transform 400ms ease, opacity 400ms ease',
      }}>

        {/* SCREEN 0: The Basics */}
        {step === 0 && (
          <div style={{
            padding: '48px 24px 100px 24px',
            maxWidth: 560,
            width: '100%',
            margin: '0 auto',
          }}>
            <h1 style={{
              fontFamily: displayFont,
              fontSize: 'clamp(28px, 3.5vw, 48px)',
              fontWeight: 400,
              fontStyle: 'italic',
              lineHeight: 1.2,
              color: theme.accent,
              margin: '0 0 48px 0',
              textAlign: 'left',
            }}>
              you know who you are. prove it.
            </h1>

            <div style={{ height: 1, background: theme.border, marginBottom: 40 }} />

            <div style={fieldGroup}>
              <label style={labelStyle}>FULL NAME</label>
              <input style={getInputStyle('fullName')} onFocus={() => setFocusedField('fullName')} onBlur={() => setFocusedField(null)} type="text" value={data.fullName} onChange={e => set('fullName', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>EMAIL</label>
              <input style={getInputStyle('email')} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} type="email" value={data.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>PHONE</label>
              <input style={getInputStyle('phone')} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} type="tel" value={data.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>CITY</label>
                <input style={getInputStyle('city')} onFocus={() => setFocusedField('city')} onBlur={() => setFocusedField(null)} type="text" value={data.city} onChange={e => set('city', e.target.value)} placeholder="Austin, TX" />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>NEIGHBORHOOD</label>
                <input style={getInputStyle('neighborhood')} onFocus={() => setFocusedField('neighborhood')} onBlur={() => setFocusedField(null)} type="text" value={data.neighborhood} onChange={e => set('neighborhood', e.target.value)} placeholder="Travis Heights" />
              </div>
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>HOME ADDRESS</label>
              <input style={getInputStyle('homeAddress')} onFocus={() => setFocusedField('homeAddress')} onBlur={() => setFocusedField(null)} type="text" value={data.homeAddress} onChange={e => set('homeAddress', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHERE ARE YOU FROM ORIGINALLY</label>
              <input style={getInputStyle('from')} onFocus={() => setFocusedField('from')} onBlur={() => setFocusedField(null)} type="text" value={data.fromOriginally} onChange={e => set('fromOriginally', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>BIRTHDAY</label>
              <input style={{ ...getInputStyle('bday'), colorScheme: isNight ? 'dark' : 'light' }} onFocus={() => setFocusedField('bday')} onBlur={() => setFocusedField(null)} type="date" value={data.birthday} onChange={e => set('birthday', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WEBSITE, INSTAGRAM, OR ANYTHING THAT SHOWS YOUR WORK</label>
              <input style={getInputStyle('links')} onFocus={() => setFocusedField('links')} onBlur={() => setFocusedField(null)} type="text" value={data.links} onChange={e => set('links', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>REFERRED BY</label>
              <input style={{ ...getInputStyle('ref0'), marginBottom: 10 }} onFocus={() => setFocusedField('ref0')} onBlur={() => setFocusedField(null)} type="text" value={data.referrers[0]} onChange={e => set('referrers', [e.target.value, data.referrers[1], data.referrers[2]])} />
              {data.referrers[0].trim() && (
                <input style={{ ...getInputStyle('ref1'), marginBottom: 10 }} onFocus={() => setFocusedField('ref1')} onBlur={() => setFocusedField(null)} type="text" value={data.referrers[1]} onChange={e => set('referrers', [data.referrers[0], e.target.value, data.referrers[2]])} />
              )}
              {data.referrers[1].trim() && (
                <input style={getInputStyle('ref2')} onFocus={() => setFocusedField('ref2')} onBlur={() => setFocusedField(null)} type="text" value={data.referrers[2]} onChange={e => set('referrers', [data.referrers[0], data.referrers[1], e.target.value])} />
              )}
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>TELL US ABOUT WHAT YOU DO — YOUR ROLE, INDUSTRY, COMPANY, CREATIVE PURSUITS, PASSION PROJECTS. WHAT KEEPS YOU BUSY?</label>
              <textarea style={getTextareaStyle('whatYouDo')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('whatYouDo')} onBlur={() => setFocusedField(null)} rows={1} value={data.whatYouDo} onChange={e => set('whatYouDo', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>HOW DID YOU HEAR ABOUT NOBC?</label>
              <input style={getInputStyle('howDidYouHear')} onFocus={() => setFocusedField('howDidYouHear')} onBlur={() => setFocusedField(null)} type="text" value={data.howDidYouHear} onChange={e => set('howDidYouHear', e.target.value)} />
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(handleBasicsNext)}
          </div>
        )}

        {/* SCREEN 1: Personality & Perspective */}
        {step === 1 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[1].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[1].heading}</h1>

            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT ARE YOU WORKING ON RIGHT NOW</label>
              <textarea style={getTextareaStyle('workingOn')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('workingOn')} onBlur={() => setFocusedField(null)} rows={1} value={data.workingOn} onChange={e => set('workingOn', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT&apos;S SOMETHING YOU&apos;VE BECOME OBSESSIVE ABOUT LATELY</label>
              <textarea style={getTextareaStyle('obsessedWith')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('obsessedWith')} onBlur={() => setFocusedField(null)} rows={1} value={data.obsessedWith} onChange={e => set('obsessedWith', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>THINK OF SOMEONE YOU ADMIRE — DOESN&apos;T HAVE TO BE SOMEONE YOU KNOW PERSONALLY. WHO ARE THEY, AND WHAT INSPIRES YOU ABOUT THEM?</label>
              <textarea style={getTextareaStyle('personYouAdmire')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('personYouAdmire')} onBlur={() => setFocusedField(null)} rows={1} value={data.personYouAdmire} onChange={e => set('personYouAdmire', e.target.value)} />
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => patchAndAdvance({
              'personality.workingOn': data.workingOn,
              'personality.obsessedWith': data.obsessedWith,
              'personality.personYouAdmire': data.personYouAdmire,
            }, 2))}
          </div>
        )}

        {/* SCREEN 2: Community Fit */}
        {step === 2 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[2].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[2].heading}</h1>

            <div style={fieldGroup}>
              <label style={labelStyle}>HOW DO YOU KNOW WHEN YOU&apos;RE IN GOOD COMPANY?</label>
              <textarea style={getTextareaStyle('howDoYouKnowGoodCompany')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('howDoYouKnowGoodCompany')} onBlur={() => setFocusedField(null)} rows={1} value={data.howDoYouKnowGoodCompany} onChange={e => set('howDoYouKnowGoodCompany', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>TELL US ABOUT A CONNECTION, INTRODUCTION, OR OPPORTUNITY YOU HELPED CREATE FOR SOMEONE ELSE.</label>
              <textarea style={getTextareaStyle('connectionOpportunity')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('connectionOpportunity')} onBlur={() => setFocusedField(null)} rows={1} value={data.connectionOpportunity} onChange={e => set('connectionOpportunity', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT GROUP OR COMMUNITY HAVE YOU STAYED LOYAL TO, AND WHY</label>
              <textarea style={getTextareaStyle('loyal')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('loyal')} onBlur={() => setFocusedField(null)} rows={1} value={data.loyalCommunity} onChange={e => set('loyalCommunity', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT KIND OF PEOPLE, IDEAS, OR OPPORTUNITIES TEND TO FLOW THROUGH YOUR WORLD?</label>
              <textarea style={getTextareaStyle('whatKindOfPeopleFlowThrough')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('whatKindOfPeopleFlowThrough')} onBlur={() => setFocusedField(null)} rows={1} value={data.whatKindOfPeopleFlowThrough} onChange={e => set('whatKindOfPeopleFlowThrough', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHO ARE THE MOST INTERESTING PEOPLE IN YOUR LIFE RIGHT NOW</label>
              <textarea style={getTextareaStyle('interesting')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('interesting')} onBlur={() => setFocusedField(null)} rows={1} value={data.interestingPeople} onChange={e => set('interestingPeople', e.target.value)} />
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => {
              if (!isDemo && !data.howDoYouKnowGoodCompany.trim()) {
                setError('Please answer how you know when you\'re in good company.');
                return;
              }
              setError('');
              patchAndAdvance({
                'community.howDoYouKnowGoodCompany': data.howDoYouKnowGoodCompany,
                'community.connectionOpportunity': data.connectionOpportunity,
                'community.loyalCommunity': data.loyalCommunity,
                'community.whatKindOfPeopleFlowThrough': data.whatKindOfPeopleFlowThrough,
                'community.interestingPeople': data.interestingPeople,
              }, 3);
            })}
          </div>
        )}

        {/* SCREEN 3: Taste */}
        {step === 3 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[3].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[3].heading}</h1>

            <div style={fieldGroup}>
              <label style={labelStyle}>A RESTAURANT, BAR, HOTEL, OR SHOP THAT GETS THE DETAILS RIGHT</label>
              <textarea style={getTextareaStyle('details')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('details')} onBlur={() => setFocusedField(null)} rows={1} value={data.detailsRight} onChange={e => set('detailsRight', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHOSE TASTE, RECOMMENDATIONS, OR PERSPECTIVE DO YOU TRUST ALMOST AUTOMATICALLY? COULD BE A FRIEND, CELEBRITY, CREATOR, ATHLETE, OR SOMEONE IN YOUR LIFE.</label>
              <textarea style={getTextareaStyle('trust')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('trust')} onBlur={() => setFocusedField(null)} rows={1} value={data.trustTaste} onChange={e => set('trustTaste', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT&apos;S THE LAST THING YOU CONVINCED A FRIEND TO BUY — AND WHAT DO YOU RECOMMEND TO EVERYONE LIKE YOU&apos;RE GETTING PAID FOR IT?</label>
              <textarea style={getTextareaStyle('recommend')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('recommend')} onBlur={() => setFocusedField(null)} rows={1} value={data.recommend} onChange={e => set('recommend', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHERE DO YOU SPLURGE VS. WHERE DO YOU SAVE</label>
              <textarea style={getTextareaStyle('splurge')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('splurge')} onBlur={() => setFocusedField(null)} rows={1} value={data.splurgeVsSave} onChange={e => set('splurgeVsSave', e.target.value)} />
            </div>

            <div style={fieldGroup}>
              <label style={{ ...labelStyle, marginBottom: 16 }}>WHERE DO YOU TURN FOR RECOMMENDATIONS?</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 24px' }}>
                {([
                  { label: 'Travel', key: 'recommendTravel' as const },
                  { label: 'Food & Drink', key: 'recommendFoodDrink' as const },
                  { label: 'Wellness & Fitness', key: 'recommendWellnessFitness' as const },
                  { label: 'Fashion', key: 'recommendFashion' as const },
                  { label: 'Home & Design', key: 'recommendHomeDesign' as const },
                ] as const).map(({ label, key }) => (
                  <div key={key} style={fieldGroup}>
                    <label style={{ ...labelStyle, fontSize: 10 }}>{label.toUpperCase()}</label>
                    <input style={getInputStyle(key)} onFocus={() => setFocusedField(key)} onBlur={() => setFocusedField(null)} type="text" placeholder={label} value={data[key]} onChange={e => set(key, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => patchAndAdvance({
              'taste.detailsRight': data.detailsRight,
              'taste.trustTaste': data.trustTaste,
              'taste.recommend': data.recommend,
              'taste.splurgeVsSave': data.splurgeVsSave,
              'taste.recommendTravel': data.recommendTravel,
              'taste.recommendFoodDrink': data.recommendFoodDrink,
              'taste.recommendWellnessFitness': data.recommendWellnessFitness,
              'taste.recommendFashion': data.recommendFashion,
              'taste.recommendHomeDesign': data.recommendHomeDesign,
            }, 4))}
          </div>
        )}

        {/* SCREEN 4: Rapid Fire */}
        {step === 4 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[4].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[4].heading}</h1>
            <p style={{ fontFamily: bodyFont, fontSize: 13, color: theme.muted, marginBottom: 40, marginTop: -24, letterSpacing: '0.02em' }}>Quick answers only.</p>

            {([
              { label: 'KARAOKE SONG', key: 'karaokeS' as const },
              { label: "WHAT'S ON YOUR COFFEE TABLE", key: 'coffeeTable' as const },
              { label: "WHAT'S YOUR IDEAL SATURDAY?", key: 'idealSaturday' as const },
              { label: 'SUNDAY MORNING — WHAT DOES IT LOOK LIKE?', key: 'sundayMorning' as const },
              { label: 'WHAT KIND OF CONTENT STOPS YOU SCROLLING, AND WHERE IS IT LIVING?', key: 'contentStopsScrolling' as const },
              { label: "SOMETHING YOU USE EVERY DAY THAT MOST PEOPLE DON'T KNOW ABOUT", key: 'everydayItem' as const },
              { label: 'PREFERRED WORKOUT, IF ANY?', key: 'preferredWorkout' as const },
              { label: 'A LOCAL AUSTIN BRAND YOU LOVE TO REP?', key: 'localAustinBrand' as const },
              { label: 'DREAM BRAND PARTNERSHIP — WHO WOULD YOU WANT, AND WHY?', key: 'dreamBrandPartnership' as const },
              { label: "WHAT'S CURRENTLY IN YOUR SHOPPING CART OR ON YOUR WISH LIST?", key: 'shoppingCart' as const },
              { label: 'WHAT DO YOU SPEND MORE MONEY ON THAN MOST PEOPLE?', key: 'spendMoreThanMost' as const },
              { label: 'WHAT ARE THE TOP 2-3 PODCASTS YOU LISTEN TO THE MOST?', key: 'topPodcasts' as const },
            ] as const).map(({ label, key }) => (
              <div key={key} style={fieldGroup}>
                <label style={labelStyle}>{label}</label>
                <input style={getInputStyle(key)} onFocus={() => setFocusedField(key)} onBlur={() => setFocusedField(null)} type="text" value={data[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => patchAndAdvance({
              'rapid.karaokeS': data.karaokeS,
              'rapid.coffeeTable': data.coffeeTable,
              'rapid.idealSaturday': data.idealSaturday,
              'rapid.sundayMorning': data.sundayMorning,
              'rapid.contentStopsScrolling': data.contentStopsScrolling,
              'rapid.everydayItem': data.everydayItem,
              'rapid.preferredWorkout': data.preferredWorkout,
              'rapid.localAustinBrand': data.localAustinBrand,
              'rapid.dreamBrandPartnership': data.dreamBrandPartnership,
              'rapid.shoppingCart': data.shoppingCart,
              'rapid.spendMoreThanMost': data.spendMoreThanMost,
              'rapid.topPodcasts': data.topPodcasts,
            }, 5))}
          </div>
        )}

        {/* SCREEN 5: Tell Us About You */}
        {step === 5 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[5].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[5].heading}</h1>

            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT DO PEOPLE CONSISTENTLY COME TO YOU FOR? COULD BE ADVICE, INTRODUCTIONS, RECOMMENDATIONS, TASTE, STRATEGY, OPPORTUNITIES, EXPERIENCES, PERSPECTIVE, OR SOMETHING ELSE ENTIRELY.</label>
              <textarea style={getTextareaStyle('whatPeopleComeToYouFor')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('whatPeopleComeToYouFor')} onBlur={() => setFocusedField(null)} rows={1} value={data.whatPeopleComeToYouFor} onChange={e => set('whatPeopleComeToYouFor', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT HAVE YOU INVESTED HEAVILY IN RECENTLY — TIME, MONEY, ENERGY, OR ATTENTION?</label>
              <textarea style={getTextareaStyle('heavilyInvestedIn')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('heavilyInvestedIn')} onBlur={() => setFocusedField(null)} rows={1} value={data.heavilyInvestedIn} onChange={e => set('heavilyInvestedIn', e.target.value)} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>WHAT DO YOU CONSIDER YOURSELF A GENUINE EXPERT IN — PROFESSIONALLY OR OTHERWISE?</label>
              <textarea style={getTextareaStyle('genuineExpertIn')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('genuineExpertIn')} onBlur={() => setFocusedField(null)} rows={1} value={data.genuineExpertIn} onChange={e => set('genuineExpertIn', e.target.value)} />
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => {
              if (!isDemo && (!data.whatPeopleComeToYouFor.trim() || !data.heavilyInvestedIn.trim() || !data.genuineExpertIn.trim())) {
                setError('Please answer all three questions.');
                return;
              }
              setError('');
              patchAndAdvance({
                'about.whatPeopleComeToYouFor': data.whatPeopleComeToYouFor,
                'about.heavilyInvestedIn': data.heavilyInvestedIn,
                'about.genuineExpertIn': data.genuineExpertIn,
              }, 6);
            })}
          </div>
        )}

        {/* SCREEN 6: Photos */}
        {step === 6 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[6].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[6].heading}</h1>
            <p style={{ fontFamily: bodyFont, fontSize: 13, color: theme.muted, marginBottom: 40, marginTop: -24, letterSpacing: '0.02em' }}>
              Candid over headshot. We want to see you in the wild.
            </p>

            {photoPreviewUrls.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 100, height: 100 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i + 1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 0, border: `1px solid ${theme.border}` }} />
                    <button onClick={() => {
                      URL.revokeObjectURL(url);
                      setPhotoFiles(prev => prev.filter((_, fi) => fi !== i));
                      setPhotoPreviewUrls(prev => prev.filter((_, ui) => ui !== i));
                    }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 0, width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>&times;</button>
                  </div>
                ))}
              </div>
            )}

            <div style={fieldGroup}>
              <label style={labelStyle}>ADD PHOTOS (UP TO 5)</label>
              <label style={{ display: 'flex', width: '100%', padding: '20px 16px', border: `1px dashed ${theme.border}`, borderRadius: 0, textAlign: 'center', cursor: 'pointer', background: 'transparent', color: theme.muted, fontSize: 13, fontFamily: bodyFont, minHeight: 80, alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', letterSpacing: '0.02em' }}>
                Tap to add photos
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    const combined = [...photoFiles, ...files].slice(0, 5);
                    const newUrls = combined.map(f => URL.createObjectURL(f));
                    photoPreviewUrls.forEach(u => URL.revokeObjectURL(u));
                    setPhotoFiles(combined);
                    setPhotoPreviewUrls(newUrls);
                    e.target.value = '';
                  }} />
              </label>
              <p style={{ fontFamily: bodyFont, fontSize: 11, color: theme.muted, marginTop: 8, letterSpacing: '0.04em' }}>{photoFiles.length}/5 selected</p>
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>ANY DIETARY RESTRICTIONS, ACCESSIBILITY NEEDS, OR THINGS WE SHOULD KNOW</label>
              <textarea style={getTextareaStyle('food')} ref={el => { if (el) autoResizeTextarea(el); }} onInput={e => autoResizeTextarea(e.currentTarget)} onFocus={() => setFocusedField('food')} onBlur={() => setFocusedField(null)} rows={1} value={data.foodAccessibility} onChange={e => set('foodAccessibility', e.target.value)} />
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(() => {
              if (!isDemo && photoFiles.length === 0) { setError('Please add at least one photo.'); return; }
              setError('');
              patchAndAdvance({ 'photos.foodAccessibility': data.foodAccessibility }, 7);
            })}
          </div>
        )}

        {/* SCREEN 7: Legal */}
        {step === 7 && (
          <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
            <span style={chapterLabelStyle}>{SCREEN_CONFIG[7].label}</span>
            <h1 style={sectionHeadingStyle}>{SCREEN_CONFIG[7].heading}</h1>
            <p style={{ fontFamily: bodyFont, fontSize: 11, color: theme.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 24, marginTop: -24 }}>
              This waiver is a draft for attorney review.
            </p>

            <div style={{ maxHeight: 'clamp(200px, 40vw, 400px)', minHeight: 120, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', borderBottom: `1px solid ${theme.border}`, padding: '20px 0', marginBottom: 32 }}>
              <div style={{ fontFamily: bodyFont, fontSize: 13, lineHeight: 1.7, color: theme.text, whiteSpace: 'pre-line' }}>
                <strong style={{ display: 'block', marginBottom: 16, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>MEMBERSHIP APPLICATION — TERMS AND CONDITIONS</strong>

                <strong>1. MEMBERSHIP DISCRETION</strong>{'\n'}
                No Bad Company (&quot;NoBC&quot;, &quot;we&quot;, &quot;us&quot;) reserves the sole and absolute right to accept or decline any membership application for any reason or no reason. Submission of this application does not create any obligation on NoBC to grant membership. Membership decisions are final and not subject to appeal.{'\n\n'}

                <strong>2. AGE REQUIREMENT</strong>{'\n'}
                You must be 18 years of age or older to apply for membership. By submitting this application, you represent and warrant that you are at least 18 years old.{'\n\n'}

                <strong>3. COMMUNICATIONS CONSENT</strong>{'\n'}
                By submitting this application, you consent to receive communications from NoBC via email. You are automatically enrolled in No Bad News, our member communications program, which includes event announcements, community updates, and curated content. You may opt out of email communications at any time by contacting team@thenobadcompany.com. SMS/text message communications are optional and require separate affirmative consent below.{'\n\n'}

                <strong>4. PHOTO, VIDEO, AND CONTENT RELEASE</strong>{'\n'}
                By submitting this application and participating in NoBC events and activities, you grant NoBC an irrevocable, royalty-free, worldwide license to use, reproduce, distribute, and display photographs, video recordings, and other content that may capture your likeness, image, or voice in connection with NoBC events, marketing materials, social media, and other promotional purposes. This license survives termination of membership.{'\n\n'}

                <strong>5. DATA AND PRIVACY</strong>{'\n'}
                NoBC collects and stores the personal information you provide in this application for membership administration purposes. We do not sell your personal data to third parties. We retain your information for 24 months following the date of your application or the termination of your membership, whichever is later. You may request deletion of your data by contacting team@thenobadcompany.com. Certain information may be retained as required by applicable law.{'\n\n'}

                <strong>6. LIMITATION OF LIABILITY</strong>{'\n'}
                To the maximum extent permitted by applicable law, NoBC and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your membership application, membership, or participation in NoBC events or activities.{'\n\n'}

                <strong>7. GOVERNING LAW AND VENUE</strong>{'\n'}
                This agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any dispute arising under this agreement shall be resolved exclusively in the courts of Travis County, Texas.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontFamily: bodyFont, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                <input type="checkbox" checked={data.consentSms} onChange={e => set('consentSms', e.target.checked)} style={{ marginTop: 2, accentColor: theme.accent }} />
                I&apos;d like to receive event reminders and updates via text message (optional)
              </label>
            </div>
            <div style={{ marginBottom: 40 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontFamily: bodyFont, fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                <input type="checkbox" checked={data.agreedToTerms} onChange={e => set('agreedToTerms', e.target.checked)} style={{ marginTop: 2, accentColor: theme.accent }} />
                I have read and agree to the terms above
              </label>
            </div>

            {error && <p style={{ color: theme.accent, fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            {navBlock(handleSubmit, 'submit my application', !data.agreedToTerms)}
          </div>
        )}

        {/* SCREEN 8: Reveal */}
        {step === 8 && submitResult && Object.keys(submitResult.archetypeScores ?? {}).length > 0 && (
          <div style={{
            minHeight: '100vh',
            background: 'var(--bg-reveal)',
            color: 'var(--text-night)',
            fontFamily: bodyFont,
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              minHeight: '100vh',
            }}>
              {/* Left Column — 58% */}
              <div style={{
                flex: '1 1 58%',
                minWidth: 320,
                padding: 'clamp(60px, 8vw, 100px) clamp(24px, 5vw, 60px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
              }}>
                <span style={{
                  fontFamily: bodyFont,
                  fontSize: 11,
                  fontWeight: 500,
                  color: THEME.night.muted,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                  display: 'block',
                  animation: 'fadeInUp 500ms ease 0ms forwards',
                  opacity: 0,
                }}>
                  YOUR ARCHETYPE
                </span>

                <h1 style={{
                  fontFamily: displayFont,
                  fontSize: 'clamp(72px, 10vw, 140px)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: THEME.night.text,
                  lineHeight: 0.95,
                  margin: '0 0 24px 0',
                  animation: 'fadeInUp 500ms ease 0ms forwards',
                  opacity: 0,
                }}>
                  {submitResult.archetype}
                </h1>

                <p style={{
                  fontFamily: bodyFont,
                  fontSize: 18,
                  fontWeight: 400,
                  color: THEME.night.muted,
                  maxWidth: 480,
                  marginBottom: 0,
                  marginTop: 0,
                  lineHeight: 1.5,
                  animation: 'fadeInUp 500ms ease 400ms forwards',
                  opacity: 0,
                }}>
                  {archetypeData?.oneLiner ?? ''}
                </p>

                <div style={{ height: 48 }} />

                <div style={{
                  marginBottom: 32,
                  animation: 'fadeInUp 500ms ease 800ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>BY DAY</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.text,
                    maxWidth: 520,
                    margin: 0,
                  }}>{dayStory}</p>
                </div>

                <div style={{
                  marginBottom: 32,
                  animation: 'fadeInUp 500ms ease 1200ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>BY NIGHT</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.muted,
                    maxWidth: 520,
                    margin: 0,
                  }}>{nightStory}</p>
                </div>

                <div style={{
                  marginBottom: 0,
                  animation: 'fadeInUp 500ms ease 1600ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.accent,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 12,
                  }}>YOUR STORY</span>
                  <p style={{
                    fontFamily: displayFont,
                    fontSize: 20,
                    fontStyle: 'italic',
                    lineHeight: 1.8,
                    color: THEME.night.text,
                    maxWidth: 520,
                    margin: 0,
                  }}>{personalizedStory}</p>
                </div>

                {!isDemo && (
                  <p style={{
                    fontFamily: bodyFont,
                    fontSize: 14,
                    color: THEME.night.muted,
                    letterSpacing: '0.05em',
                    textAlign: 'center',
                    marginTop: 48,
                    animation: 'fadeInUp 500ms ease 1900ms forwards',
                    opacity: 0,
                  }}>
                    Your application is in. We read every one. We&apos;ll be in touch. &#x1F5A4;
                  </p>
                )}
              </div>

              {/* Right Column — 42%, sticky on desktop */}
              <div style={{
                flex: '1 1 42%',
                minWidth: 300,
                padding: 'clamp(60px, 8vw, 100px) clamp(24px, 5vw, 40px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                background: 'var(--bg-reveal-surface)',
                position: 'sticky',
                top: 0,
                alignSelf: 'flex-start',
                minHeight: '100vh',
              }}>
                {/* Spectrum bars */}
                <div style={{
                  marginBottom: 40,
                  animation: 'fadeInUp 500ms ease 2000ms forwards',
                  opacity: 0,
                }}>
                  <span style={{
                    fontFamily: bodyFont,
                    fontSize: 11,
                    fontWeight: 500,
                    color: THEME.night.muted,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: 20,
                  }}>YOUR SPECTRUM</span>
                  {ARCHETYPE_ORDER.map((name, i) => {
                    const score = submitResult.archetypeScores[name] ?? 0;
                    const isTop = submitResult.archetype === name;
                    return (
                      <div key={name} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontFamily: bodyFont, color: isTop ? THEME.night.accent : THEME.night.text, fontWeight: isTop ? 600 : 400 }}>{name}</span>
                          <span style={{ fontSize: 12, fontFamily: bodyFont, color: THEME.night.muted }}>{score}</span>
                        </div>
                        <div style={{ height: 4, background: THEME.night.border, borderRadius: 0, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${score}%`,
                            background: isTop ? THEME.night.accent : THEME.night.muted,
                            borderRadius: 0,
                            animation: `barGrow 800ms ease ${2000 + i * 150}ms forwards`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tags */}
                {submitResult.tags && submitResult.tags.length > 0 && (
                  <div style={{
                    marginBottom: 48,
                    animation: 'fadeInUp 500ms ease 2600ms forwards',
                    opacity: 0,
                  }}>
                    <span style={{
                      fontFamily: bodyFont,
                      fontSize: 11,
                      fontWeight: 500,
                      color: THEME.night.muted,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      display: 'block',
                      marginBottom: 16,
                    }}>YOUR TAGS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {submitResult.tags.map(tag => (
                        <span key={tag} style={{
                          fontFamily: bodyFont,
                          fontSize: 11,
                          color: THEME.night.text,
                          background: 'var(--bg-reveal-surface)',
                          border: `1px solid ${THEME.night.border}`,
                          borderRadius: 0,
                          padding: '8px 16px',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Share section */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  marginBottom: 48,
                  animation: 'fadeInUp 500ms ease 3000ms forwards',
                  opacity: 0,
                }}>
                  <button style={{
                    background: 'transparent',
                    color: THEME.night.accent,
                    border: `1px solid ${THEME.night.accent}`,
                    borderRadius: 0,
                    padding: '0 24px',
                    height: 48,
                    fontSize: 12,
                    fontFamily: bodyFont,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    width: '100%',
                  }} onClick={generateShareCard}>
                    share your archetype
                  </button>
                  <button style={{
                    background: 'transparent',
                    color: THEME.night.accent,
                    border: `1px solid ${THEME.night.accent}`,
                    borderRadius: 0,
                    padding: '0 24px',
                    height: 48,
                    fontSize: 12,
                    fontFamily: bodyFont,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    width: '100%',
                  }} onClick={() => { navigator.clipboard.writeText(window.location.href).catch(() => {}); }}>
                    copy link
                  </button>
                </div>

                {/* Frogger trigger */}
                <div style={{
                  textAlign: 'center',
                  animation: 'fadeInUp 500ms ease 3000ms forwards',
                  opacity: 0,
                }}>
                  <button onClick={() => setShowFrogger(true)} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: bodyFont,
                    fontSize: 12,
                    color: THEME.night.muted,
                    letterSpacing: '0.04em',
                  }}>
                    still with us?
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 8 && submitResult && Object.keys(submitResult.archetypeScores ?? {}).length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 80, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <h1 style={{ fontFamily: bodyFont, fontSize: 28, fontWeight: 500, color: theme.text, marginBottom: 16 }}>
              Your answers are in.
            </h1>
            <p style={{ fontFamily: bodyFont, fontSize: 16, color: theme.muted }}>
              We&apos;ll be in touch.
            </p>
          </div>
        )}

        {step === 8 && !submitResult && (
          <div style={{ textAlign: 'center', paddingTop: 80, minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ fontFamily: bodyFont, fontSize: 16, color: theme.muted }}>Reading your application...</p>
          </div>
        )}

      </main>

      {showFrogger && <FroggerGame onClose={() => setShowFrogger(false)} />}

      {isDev && (
        <>
          <button
            className="hidden sm:block"
            onClick={() => setShowDevPicker(v => !v)}
            onMouseEnter={() => setDevHovered(true)}
            onMouseLeave={() => setDevHovered(false)}
            style={{
              position: 'fixed', bottom: 16, left: 16, zIndex: 100,
              background: theme.text,
              color: theme.bg,
              border: 'none', borderRadius: 0, padding: '6px 12px',
              fontSize: 10, fontFamily: bodyFont, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer', opacity: devHovered ? 0.6 : 0.15,
              transition: 'opacity 200ms ease',
            }}
          >
            fill test data
          </button>
          {testDataLoaded && !showDevPicker && (
            <div
              className="hidden sm:block"
              style={{
              position: 'fixed', bottom: 50, left: 16, zIndex: 100,
              background: theme.accent, color: '#ffffff',
              borderRadius: 0, padding: '4px 10px',
              fontSize: 10, fontFamily: bodyFont, pointerEvents: 'none',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              test data loaded
            </div>
          )}
          {showDevPicker && (
            <div
              className="hidden sm:block"
              style={{
                position: 'fixed', bottom: 50, left: 16, zIndex: 101,
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 4,
                padding: '8px 0',
                minWidth: 240,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              <p style={{
                fontSize: 9, fontFamily: bodyFont, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: theme.muted,
                padding: '0 12px 8px',
                borderBottom: `1px solid ${theme.border}`,
                marginBottom: 4,
              }}>select applicant</p>
              {DEMO_SETS.map(set => (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => {
                    setData(prev => ({ ...prev, ...set.data }));
                    setTestDataLoaded(true);
                    setShowDevPicker(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 12px',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = theme.border; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: set.color, flexShrink: 0,
                    display: 'inline-block',
                  }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11, fontFamily: bodyFont, color: theme.text, fontWeight: 500 }}>{set.name}</span>
                    <span style={{ display: 'block', fontSize: 9, fontFamily: bodyFont, color: theme.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{set.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      </div>
    </>
  );
}
