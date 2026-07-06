export type ArchetypeName = 'Connector' | 'Host' | 'Builder' | 'Patron' | 'Sage' | 'Spark';

export interface Archetype {
  /** Stored enum value. NEVER renamed - it is what lives in Application.archetype
   *  and archetypeScores keys in the DB. */
  name: ArchetypeName;
  /** User-facing name. ALL UI renders this; the stored `name` is never shown raw.
   *  Host -> Caregiver, Patron -> Champion; every other archetype's displayName
   *  equals its name. */
  displayName: string;
  /** The pulled-out identity line on the reveal + share card. */
  oneLiner: string;
  /** Reveal beat 1 - "Who you are". */
  whoYouAre: string;
  /** Reveal beat 2 - "The cost" (the shadow / screenshot moment). */
  theCost: string;
  /** Reveal beat 3 - "How you move through a room". */
  howYouMove: string;
  /** @deprecated Kept only so existing consumers (the operator application
   *  detail page) keep compiling. The new reveal does NOT render these. Empty
   *  for the two new archetypes (Sage, Spark). */
  dayStory: string;
  /** @deprecated See dayStory. */
  nightStory: string;
  tags: string[];
  sponsorSegments: string[];
  spectrumDescription: string;
}

export const ARCHETYPES: Record<ArchetypeName, Archetype> = {
  Connector: {
    name: 'Connector',
    displayName: 'Connector',
    oneLiner: `You give before you ask. Every time.`,
    whoYouAre: `You think two steps ahead for everyone around you. You meet someone and part of you is already asking not "what do you do" but "how can I help" - who they should know, what door you could open. People leave you feeling expanded, not because they gained a contact but because they gained something real. When the right people win, everyone around them does too, and you know it.`,
    theCost: `You're so busy connecting everyone else that you forget to let anyone connect you. You hold the whole web and quietly wonder who's holding you. Learning to receive is the hardest thing you'll do.`,
    howYouMove: `You're reading who needs each other - the founder who should meet the operator, the person alone who belongs in the conversation ten feet away. The best nights end with two strangers you introduced still deep in it an hour later, having forgotten you're the reason.`,
    dayStory: "You move through the world already knowing who needs to meet who. It's not networking - it's pattern recognition at a social scale. You don't collect people, you create conditions. The introductions you make have half-lives measured in years.",
    nightStory: "You already know everyone in the room and you've made two introductions before the first drink is finished. By monday morning, people who met through you are texting each other. That's you. That's what you did.",
    tags: ['connector', 'network', 'community-builder', 'matchmaker', 'social-capital'],
    sponsorSegments: ['premium travel', 'private members clubs', 'executive services', 'luxury automotive', 'wealth management'],
    spectrumDescription: 'Connectors are defined by the value they create for others - their superpower is seeing the relationship before anyone else does.',
  },
  Host: {
    name: 'Host',
    displayName: 'Caregiver',
    oneLiner: `You make people feel like family, not guests.`,
    whoYouAre: `You notice what's needed and make it happen without being asked. Your care shows up as action - the problem solved before anyone knew there was one, the person standing alone who suddenly has someone to talk to. Your warmth is matched by your competence. You don't just make people feel comfortable; you make them feel safe.`,
    theCost: `You carry everyone and let no one carry you. You're first to ask if someone's eaten and last to admit you haven't. Being taken care of feels almost unbearable - like being a burden - which is the one thing you'd never let anyone else feel.`,
    howYouMove: `You clock who needs something - the one on the edge, the empty glass, the task everyone assumes someone else will do. People don't feel hosted around you. They feel held.`,
    dayStory: "Comfort is your love language - not luxury, ease. The kind that takes real effort to create but looks completely effortless. You read rooms the way other people read faces. You adjust before anyone notices something was off.",
    nightStory: "You're the one who made sure there was a spot for the person standing alone. Nobody notices the logistics because you already handled them. The evening feels inevitable. It wasn't.",
    tags: ['host', 'hospitality', 'warmth', 'space-maker', 'community-anchor'],
    sponsorSegments: ['spirits and F&B', 'hospitality tech', 'home and interiors', 'culinary', 'hotel brands'],
    spectrumDescription: 'Hosts create the conditions everyone else takes for granted - the warmth, the ease, the sense that someone thought of everything.',
  },
  Builder: {
    name: 'Builder',
    displayName: 'Builder',
    oneLiner: `A blank page is just Tuesday.`,
    whoYouAre: `You don't just imagine what's possible, you make it - and you can't help pulling other people into the making. Where someone sees a wall, you already see the first three steps and you're saying "let's build it." You mentor without being asked, hand people tools, show them a strength they hadn't noticed. You don't compete with potential. You cultivate it. People leave you wanting to start the business, write the book, finally begin.`,
    theCost: `You can't turn it off. Rest feels like waste; a vacation becomes a project. You measure your days in output and forget that you're allowed to be a person, not just a productivity. The hardest thing you'll build is a version of yourself that's allowed to stop.`,
    howYouMove: `You're reading how the room works and who's actually making something. You find the people doing the work and get generous fast - the idea, the intro, the "here's how I'd approach it." Connection, for you, is a thing you build with someone, and it holds because you made it to.`,
    dayStory: "You've made something from nothing and you know what that actually costs. The sleepless nights, the pivots, the small wins that don't feel small in the moment. That experience is visible in how you move - you're never waiting for permission.",
    nightStory: "You have an early prototype on your phone and a very specific question for the person across the table. You're always building something. The ideas don't stop when the workday does.",
    tags: ['founder', 'builder', 'operator', 'executor', 'ship-it'],
    sponsorSegments: ['B2B SaaS', 'fintech', 'business banking', 'productivity tools', 'coworking'],
    spectrumDescription: 'Builders are defined by output - they close the gap between idea and reality faster than anyone around them.',
  },
  Patron: {
    name: 'Patron',
    displayName: 'Champion',
    oneLiner: `When it gets hard, you move closer.`,
    whoYouAre: `You measure friendship by showing up, not by words. You're fiercely loyal and quietly brave, and you don't advocate for people because it benefits you - you do it because it's who you are. When everyone else backs away, you step in. Your gift isn't making people feel admired. It's making them feel safe.`,
    theCost: `You'd walk through fire for your people and struggle to ask them for a glass of water. You're everyone's rock, which means you rarely get to be held - and you've made "I'm fine" a reflex even when you're not.`,
    howYouMove: `You find your people and you plant. You're not working the crowd - you're the steady one that one or two folks lean on all night. When you're in the room, someone always feels like they've got backup. They're right.`,
    dayStory: "You see potential early and you act on it before others can name it. Your support is often how things become real for the people around you. You're not transactional about it - you just know what matters and you back it.",
    nightStory: "You made this event possible by deciding it mattered. You funded the idea, made the introduction, opened the door. Nobody announced it. The room exists because you believed in it first.",
    tags: ['patron', 'investor', 'philanthropist', 'door-opener', 'long-game'],
    sponsorSegments: ['wealth management', 'real estate', 'luxury watches', 'automotive', 'private banking'],
    spectrumDescription: 'Patrons are the silent condition of possibility - their belief and backing is what turns potential into reality.',
  },
  Sage: {
    name: 'Sage',
    displayName: 'Sage',
    oneLiner: `You don't collect attention. You collect understanding.`,
    whoYouAre: `You'd rather know five people deeply than five hundred at a glance. You read a room before you've said a word in it - the hesitation before someone speaks, the thing they're not saying. People trust you with the real stuff because you actually listen, and they leave your conversations thinking differently without quite knowing how you did it.`,
    theCost: `You see everyone so clearly that you stay a little unseen yourself. You ask the questions; you rarely answer them. The room feels known by you and never quite knows you back.`,
    howYouMove: `You hang back and read first - who's performing, who's real, who's worth finding in the corner. By the end of the night the person you talked to feels like the most interesting person there. That was you. You made them that.`,
    dayStory: '',
    nightStory: '',
    tags: ['sage', 'perception', 'insight', 'listener', 'discernment'],
    sponsorSegments: ['books and media', 'wellness', 'education', 'coaching', 'fine spirits'],
    spectrumDescription: 'Sages are trusted for perception - they understand people and situations before anyone else can name what is happening.',
  },
  Spark: {
    name: 'Spark',
    displayName: 'Spark',
    oneLiner: `People don't remember the night. They remember how they felt around you.`,
    whoYouAre: `You have an instinct for joy. You create momentum, turn ordinary moments into stories, pull the energy up wherever you land - not to be noticed, but because you genuinely can't help it. You're the one who says yes to the dumb idea, and the dumb idea becomes the best part.`,
    theCost: `You're so good at lifting the room that no one thinks to check if you're up. You're the fun one, which can be a hard costume to take off - and the quiet moments, the ones with no momentum to create, are the ones you find hardest to sit in.`,
    howYouMove: `You don't wait for permission to belong. First to smile, first to introduce yourself, first to make a stranger feel like a friend. By the end of the night the room is warmer and nobody can point to when it happened. It was when you got there.`,
    dayStory: '',
    nightStory: '',
    tags: ['spark', 'energy', 'joy', 'catalyst', 'social-momentum'],
    sponsorSegments: ['nightlife', 'events and experiences', 'travel', 'fashion', 'beverage'],
    spectrumDescription: 'Sparks set the emotional temperature of a room - they turn ordinary moments into the ones people remember.',
  },
};

export const ARCHETYPE_ORDER: ArchetypeName[] = ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'];

/** The single user-facing-name resolver. Stored enum values (including legacy
 *  Curator/Maker on old rows) are never shown raw: known archetypes render their
 *  displayName; any unknown/legacy value falls back to the raw string so old
 *  applications still label. Every user-facing render of an archetype MUST go
 *  through this. */
export function archetypeDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  return (ARCHETYPES as Record<string, Archetype>)[name]?.displayName ?? name;
}
