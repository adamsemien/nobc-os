export type ArchetypeName = 'Connector' | 'Host' | 'Curator' | 'Builder' | 'Maker' | 'Patron';

export interface Archetype {
  name: ArchetypeName;
  oneLiner: string;
  dayStory: string;
  nightStory: string;
  tags: string[];
  sponsorSegments: string[];
  spectrumDescription: string;
}

export const ARCHETYPES: Record<ArchetypeName, Archetype> = {
  Connector: {
    name: 'Connector',
    oneLiner: 'relationships as currency. thinks two steps ahead for everyone around them.',
    dayStory: "You move through the world already knowing who needs to meet who. It's not networking — it's pattern recognition at a social scale. You don't collect people, you create conditions. The introductions you make have half-lives measured in years.",
    nightStory: "You already know everyone in the room and you've made two introductions before the first drink is finished. By monday morning, people who met through you are texting each other. That's you. That's what you did.",
    tags: ['connector', 'network', 'community-builder', 'matchmaker', 'social-capital'],
    sponsorSegments: ['premium travel', 'private members clubs', 'executive services', 'luxury automotive', 'wealth management'],
    spectrumDescription: 'Connectors are defined by the value they create for others — their superpower is seeing the relationship before anyone else does.',
  },
  Host: {
    name: 'Host',
    oneLiner: 'sets the table before anyone asks. the room doesn\'t start without them.',
    dayStory: "Comfort is your love language — not luxury, ease. The kind that takes real effort to create but looks completely effortless. You read rooms the way other people read faces. You adjust before anyone notices something was off.",
    nightStory: "You're the one who made sure there was a spot for the person standing alone. Nobody notices the logistics because you already handled them. The evening feels inevitable. It wasn't.",
    tags: ['host', 'hospitality', 'warmth', 'space-maker', 'community-anchor'],
    sponsorSegments: ['spirits and F&B', 'hospitality tech', 'home and interiors', 'culinary', 'hotel brands'],
    spectrumDescription: 'Hosts create the conditions everyone else takes for granted — the warmth, the ease, the sense that someone thought of everything.',
  },
  Curator: {
    name: 'Curator',
    oneLiner: 'shares the one thing worth your time. never cries wolf.',
    dayStory: "You're selective and you have a point of view. People listen when you speak because you've earned that by being quiet when you had nothing to say. Your recommendations land because they're rare. You've never forwarded something just to seem plugged in.",
    nightStory: "You're the reason three people in this room will discover something they're still talking about a year from now. You curate quietly and let quality speak. You never explain why something is good. It just is.",
    tags: ['curator', 'tastemaker', 'cultural-capital', 'editorial', 'discernment'],
    sponsorSegments: ['fashion', 'beauty', 'luxury goods', 'boutique hotels', 'design'],
    spectrumDescription: 'Curators are trusted precisely because they\'re selective — their signal-to-noise ratio is what makes them worth following.',
  },
  Builder: {
    name: 'Builder',
    oneLiner: 'ships things. blank page is just tuesday.',
    dayStory: "You've made something from nothing and you know what that actually costs. The sleepless nights, the pivots, the small wins that don't feel small in the moment. That experience is visible in how you move — you're never waiting for permission.",
    nightStory: "You have an early prototype on your phone and a very specific question for the person across the table. You're always building something. The ideas don't stop when the workday does.",
    tags: ['founder', 'builder', 'operator', 'executor', 'ship-it'],
    sponsorSegments: ['B2B SaaS', 'fintech', 'business banking', 'productivity tools', 'coworking'],
    spectrumDescription: 'Builders are defined by output — they close the gap between idea and reality faster than anyone around them.',
  },
  Maker: {
    name: 'Maker',
    oneLiner: 'made something this week. can\'t not.',
    dayStory: "The creative impulse isn't a side project — it's how you process the world. Your hands are always doing something your brain needed to externalize. You think in materials, textures, sounds, forms. The work is never really finished.",
    nightStory: "You're sketching on a napkin or telling someone about a material they've never heard of. Your presence changes the aesthetic of whatever room you walk into. People show you things they made because they trust your reaction.",
    tags: ['maker', 'creative', 'artist', 'craftsperson', 'hands-on'],
    sponsorSegments: ['creative tools', 'instruments', 'fashion', 'art supplies', 'independent brands'],
    spectrumDescription: 'Makers externalize their inner world — the thing they made this week is always more interesting than what they\'re about to make next.',
  },
  Patron: {
    name: 'Patron',
    oneLiner: 'opens doors quietly. doesn\'t need credit.',
    dayStory: "You see potential early and you act on it before others can name it. Your support is often how things become real for the people around you. You're not transactional about it — you just know what matters and you back it.",
    nightStory: "You made this event possible by deciding it mattered. You funded the idea, made the introduction, opened the door. Nobody announced it. The room exists because you believed in it first.",
    tags: ['patron', 'investor', 'philanthropist', 'door-opener', 'long-game'],
    sponsorSegments: ['wealth management', 'real estate', 'luxury watches', 'automotive', 'private banking'],
    spectrumDescription: 'Patrons are the silent condition of possibility — their belief and backing is what turns potential into reality.',
  },
};

export const ARCHETYPE_ORDER: ArchetypeName[] = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'];
