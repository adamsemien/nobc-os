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
  /** Reveal: short identity beat under the oneLiner (1-2 sentences). */
  essence: string;
  /** Config/library content: the animal paragraph. NOT rendered on the reveal. */
  animalStory: string;
  /** Config/library + operator use: long behavioral paragraph. NOT rendered on
   *  the reveal. */
  inTheRoom: string;
  /** Reveal habitat block - "The rooms that bring out your best". */
  habitatThrive: string;
  /** Reveal habitat block - "The rooms where you can't show up as yourself". */
  habitatDim: string;
  /** Reveal - the "at your peak" line. */
  peak: string;
  /** Reveal - the "at your edge" line. */
  edge: string;
  /** OPERATOR-ONLY seating / hosting guidance. NEVER member-facing, never
   *  sponsor-facing, never in any email or share surface. */
  hostNotes: string;
  /** @deprecated Superseded by essence / habitat / peak / edge. Retained in the
   *  type so existing consumers compile; no longer rendered anywhere
   *  member-facing. */
  whoYouAre: string;
  /** @deprecated See whoYouAre. */
  theCost: string;
  /** @deprecated See whoYouAre. */
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
    essence: `You see the invisible threads between people. Your question is never "what do you do" - it's "who should you meet."`,
    animalStory: `A bee that finds something valuable doesn't keep it. It flies home and performs the waggle dance - a precise map that tells the whole hive exactly where the good stuff is. Everything a bee discovers gets shared, and every flower it touches makes the next one possible.`,
    inTheRoom: `You circulate more than anyone - not for coverage, for matchmaking. You scan for the new face, the hidden talent, the two guests who don't know they're about to be partners. Then comes your version of the waggle dance: the intro, framed with exactly why these two matter to each other. Then you step away and let it grow. You don't gather a crowd - you build a bridge and move on.`,
    habitatThrive: `Mixed rooms. New faces, crossed industries, guest lists with range. The more unlikely the combinations, the happier you are.`,
    habitatDim: `Closed circles where everyone already knows everyone. With no intros to make, you're a bee in an empty field.`,
    peak: `You slow down and go deep - staying in one conversation long enough to understand someone completely, which makes your next introduction devastating in its accuracy.`,
    edge: `The circulating turns compulsive - intros without context, motion without honey.`,
    hostNotes: `Brief them like a partner. Tell the Bee who's coming and who you hope meets, and they'll do half your curation for you. Refresh their supply - Bees need new faces at every event or they lose their reason to come.`,
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
    essence: `You make a space feel like home. Your instinct is nourishment: has everyone eaten, is anyone stranded, does the room feel warm.`,
    animalStory: `Bears are providers and protectors. They spend seasons gathering to make sure the den is stocked, and nothing on earth is more devoted than a bear looking after its own.`,
    inTheRoom: `You host, whether or not it's your house. You notice the empty glass, the guest hovering at the edge, the coat with nowhere to go. You move through the room in slow patrols, checking on people, and every stop feels personal. You don't tend one person at a time - you tend the whole den.`,
    habitatThrive: `Rooms where you have a role. Your own table, a co-host seat, the kitchen at a house party. Give you something to tend and you glow.`,
    habitatDim: `Rooms where you're a passive guest with nothing to care for. Sleek venues, transactional mixers, anywhere hospitality is outsourced. With no one to feed, you're at half power.`,
    peak: `Your care turns celebratory - the den becomes a party, and you become its warmest light.`,
    edge: `You keep giving past empty, caring for everyone but yourself, until the warmth turns into a fatigue nobody was allowed to see.`,
    hostNotes: `Deputize them. Give the Bear a corner of the night to own - the welcome, the wine, the last course - and they'll outperform your staff. Bears are your best co-hosts and your future event partners.`,
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
    essence: `You're the architect of ecosystems. You don't adapt to your environment - you reshape it, and everything around you lives better because you did.`,
    animalStory: `Beavers are the only animal besides humans that engineers its entire landscape. Their dams create wetlands that hundreds of other species depend on - scientists call them a keystone species. They build for the long term, and never for themselves alone.`,
    inTheRoom: `Ambition without volume. You're not the loudest voice or the busiest circulator - you're the one assessing whether this room is worth your time, because you value your hours the way other people value money. Your opening question isn't "what do you do." It's "what are you building" and "how can I help." You give away ideas, intros, and blueprints freely, because what you build is meant to support more than yourself. People leave your conversations wanting to start the business, write the book, finally begin.`,
    habitatThrive: `Rooms with substance. Salons, dinners with a theme, gatherings where ambition is welcome at the table. You show up fully when the room is going somewhere.`,
    habitatDim: `Aimless rooms. Small talk with no runway reads as a cost, and you start calculating what the evening is worth. It isn't rudeness. It's a keystone species with nothing to build.`,
    peak: `You open the ecosystem - your ideas, your people, your playbook, all offered to whoever's serious.`,
    edge: `The calculus takes over, the phone comes out, and a room full of perfectly nice people gets written off as a sunk cost.`,
    hostNotes: `Give the night a spine - a question, a theme, a show-and-tell - and Builders carry it. Seat them across from each other and watch a collaboration form by dessert. If your audience skews Beaver, design events around making, not mingling.`,
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
    essence: `You make people feel like the most important person in the room. You don't just support your people - you celebrate them, out loud, to their face and behind their back.`,
    animalStory: `Dogs were the first animal to evolve alongside humans, wired to read our faces and moods better than we read each other. Their greeting is unmistakable joy, their attention is total, and their loyalty is a decision they don't revisit.`,
    inTheRoom: `You greet people like the night just started because they arrived. You give undivided attention in an age of half attention - no scanning over shoulders, no waiting for your turn to talk. And you brag about the people you love. You're the one saying "you have to hear what she's building" before anyone can introduce themselves. You anchor one corner and make it the warmest spot in the room.`,
    habitatThrive: `Familiar rooms. Recurring dinners, small groups with returning faces - anywhere trust has time to compound and your enthusiasm has somewhere to land.`,
    habitatDim: `A room full of strangers trading credentials. You have nothing to offer a status game, because your currency is knowing people, not impressing them.`,
    peak: `You become the room's amplifier - turning the hype outward, introducing people through pure celebration of both.`,
    edge: `In a room with none of your people, you attach to one familiar face, guard the coat closet, and leave early.`,
    hostNotes: `The Champion is your retention engine - they're why people come back. Always seat them with at least one person they know, then add one newcomer who needs an ally. They convert first-timers into regulars.`,
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
    essence: `You collect understanding, not attention. You leave every conversation knowing more than you arrived with - and so does the person you talked to.`,
    animalStory: `Owls see in the dark. Their vision and hearing are built to catch what every other animal misses. They watch before they move, and when they move, it's silent and precise.`,
    inTheRoom: `You arrive without announcement and find one conversation worth having. You listen longer than anyone, ask the question nobody else thought of, and remember the answer months later. You're comfortable with silence and immune to the pressure to perform. You won't be found working the room - you'll be found wherever the room's most interesting conversation is happening, because you started it by sitting down.`,
    habitatThrive: `Small seated dinners. Long conversations with one or two people. Rooms built around a question worth answering.`,
    habitatDim: `Loud standing rooms with thirty shallow conversations. Icebreakers. Anywhere depth has no chance to form. You don't fail in these rooms - you go unseen.`,
    peak: `With the right people and the right song, you surprise everyone - talkative, playful, first on the dance floor. The depth was never shyness. It was selectivity.`,
    edge: `Unseen or overstimulated, you go fully silent and find the door.`,
    hostNotes: `Seat them next to your most interesting guest, not your most social one. Give them one great pairing and they'll deliver the conversation people talk about on the drive home. Never make them open the room.`,
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
    essence: `You're why the room comes alive. Your joy is genuine, contagious, and impossible to ignore. People remember how they felt around you.`,
    animalStory: `Dolphins play their entire lives, communicate constantly, and thrive in the pod. Their intelligence is social: they read the group and move with it.`,
    inTheRoom: `First to smile, first to introduce yourself, first to make a stranger feel like a regular. You gather people into a moment - the toast, the game, the story everyone joins. You convert small talk into play and pull quiet guests into the circle without making it feel like a rescue. Your arrival is noticed. So is your departure.`,
    habitatThrive: `Big energy rooms. House parties, celebrations, dance floors - any gathering with movement and permission to play.`,
    habitatDim: `A three-hour seated dinner with assigned seats and one conversation. Rooms that reward restraint. You don't misbehave in these rooms - you shrink, and everyone loses.`,
    peak: `You turn the spotlight outward, hyping other people until the whole room feels like the guest of honor.`,
    edge: `There's no half-power version of you. If the joy isn't there, neither are you - you'd rather be in bed than fake it. Which means when you show up, it's the real thing walking in.`,
    hostNotes: `Ration them. A room of all Sparks burns hot and connects shallow. One Spark per table is seasoning. Place them where the energy needs insurance - farthest from the host, next to the shyest cluster.`,
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
