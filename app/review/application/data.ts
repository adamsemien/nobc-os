// Seed content for Chloe's application-quiz review tool (/review/application).
// Ported verbatim from nobc-application-review-v2.html (reference file, not in repo).
// Per the content rule, each nature ports only: animal, nature, own, essence, ex,
// inroom, thrive, peak, host. The `dim` ("Dims in") and `edge` ("At edge") fields
// are intentionally NOT ported — no negative/shadow framing anywhere.

export type ReviewStatus = 'green' | 'yellow' | 'red';

export type MappedOption = [nature: string, text: string];

export type ReviewItem = {
  id: string;
  status: ReviewStatus;
  field: string;
  q: string;
  struck: string;
  opts: string[] | MappedOption[] | null;
  rows: [tag: string, text: string][];
  scored: string;
  cmt: string;
};

export type ReviewSection = {
  sec: string;
  sub: string;
  items: ReviewItem[];
};

/* ---------- SEED DATA ---------- */
export const SEED: ReviewSection[] = [
 /* ============ SECTION 01 ============ */
 {sec:"Section 01 · Who You Are", sub:"You said no changes here. Every field is listed in full so nothing's a mystery and nothing's assumed.", items:[
  {id:"1.1–1.6", status:"green", field:"Short text fields",
   q:"Name, email, cell, home address",
   struck:"", opts:null,
   rows:[["data","Reach you, get you to the door, and set up your member record. Your address also decides which city's events you're invited to."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.7", status:"green", field:"Short text",
   q:"What other cities do you spend real time in?",
   struck:"", opts:null,
   rows:[["data","Members split their time across cities. This lets us invite you to events in the cities you're actually in - and spot clusters. Eight members who all spend time in New York is a New York dinner waiting to be thrown."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.8", status:"green", field:"Date · city · time of birth",
   q:"Date, city, and time of birth",
   struck:"", opts:null,
   rows:[["data","Generates the Human Design and astrology read. Adds color to your reveal and gives a host one more angle on how you're wired. We reference it back to you in the reveal when we use it."]],
   scored:"Doesn't count · reveal color", cmt:""},

  {id:"1.9", status:"green", field:"Short text",
   q:"Food allergies or dietary restrictions",
   struck:"", opts:null,
   rows:[["data","The single most concrete field on the form. What each guest can and can't eat drives the menu, the caterer, and who we can seat at which table. Get it wrong and someone can't eat."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.10", status:"green", field:"Select",
   q:"Gender",
   struck:"", opts:null,
   rows:[["data","Room balance. Lets us build a table and an event with a deliberate mix instead of an accidental one."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.11", status:"green", field:"URL fields (website · LinkedIn · Instagram · other)",
   q:"Links that tell us about you",
   struck:"", opts:null,
   rows:[["data","Vetting and matching intros. LinkedIn tells us your professional lane for who-should-meet-whom; Instagram tells us your world and your taste."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.12", status:"green", field:"Photo upload (1–5)",
   q:"Photos of you",
   struck:"", opts:null,
   rows:[["data","Two jobs: a face at the door so hosts recognize you, and the reveal photo - the first one you upload opens your nature reveal."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.13", status:"green", field:"Long text",
   q:"What do you do? (role, industry, company)",
   struck:"", opts:null,
   rows:[
    ["data","Matching intros, and the room-quality numbers a sponsor pays for. It answers \"who do I know in fintech\" and \"who's a founder,\" and it's the raw material behind the room-quality figures we can show a sponsor."],
    ["score","Doesn't count toward a nature. A job title is something we act on, not a room signal - \"Senior PM at a bank\" tells us nothing about how you show up at a party."]
   ],
   scored:"Doesn't count · data field",
   cmt:"FOR ADAM: changed. The last version scored this \"lightly.\" The locked model has no half-score, and a job title isn't a room signal, so it's now a pure data field. Say if you'd rather it count."},

  {id:"1.14", status:"green", field:"Long text",
   q:"What characteristics make you good at your job?",
   struck:"", opts:null,
   rows:[
    ["score","Counts. AI reads it and gives 0, +1, or +2. Your self-described strengths often reveal a nature - \"I get people to open up\" leans Sage or Champion, \"I see what something could become\" leans Builder. A generic or blank answer scores 0 and counts for nothing."],
    ["data","Conversation and seating fuel - what you're genuinely good at, in your words."]
   ],
   scored:"Counts · 0 to +2", cmt:""},

  {id:"1.15", status:"yellow", field:"Long text",
   q:"Creative pursuits and passion projects",
   struck:"", opts:null,
   rows:[
    ["data","Becomes interest tags. What you build or make outside work is a seating adjacency and an intro hook."],
    ["score","Doesn't count toward a nature - it's interest data for seating, not a clean room signal."]
   ],
   scored:"Doesn't count · interest tags",
   cmt:"FOR ADAM: decision. Last version scored this 0 to +1. The locked model has no half-score, so it's either a full 0 to +2 open answer or pure data. I set it to pure data to keep hobby noise out of the tally. Flip it to a full 0 to +2 open answer if you'd rather it count."},

  {id:"1.16", status:"green", field:"Name fields (up to 3)",
   q:"Who referred you?",
   struck:"", opts:null,
   rows:[["data","The trust graph - who vouches for whom. Powers referral credit, and tells us which current members to seat a newcomer beside."]],
   scored:"Doesn't count", cmt:""},

  {id:"1.17", status:"green", field:"Select (nine types) + link to a free test",
   q:"Enneagram Type",
   struck:"", opts:null,
   rows:[
    ["map","Nudges the nature whose core drive it matches. Backs up how you moved in the room; never overrides it."],
    ["data","A hosting note - an 8 wants a real sparring partner at the table; a 9 wants low-conflict harmony; a 2 wants to feel needed."],
    ["score","Counts as a type. Every type you give shares one +1 total, and it only breaks a tie between two close natures - it never picks the nature on its own. Hard rule: if you give it, your reveal names it."]
   ],
   scored:"Counts · type (+1 total)", cmt:""},

  {id:"1.18", status:"green", field:"Select (sixteen types) + link to a free test",
   q:"Myers-Briggs Type",
   struck:"", opts:null,
   rows:[
    ["map","Maps its four letters toward the natures they lean - an ENFJ leans Spark/Champion, an INTJ leans Sage/Builder."],
    ["data","Another angle on how you're wired, for the reveal and the hosting note."],
    ["score","Counts as a type - shares the same +1 total across all types, tie-break only. Named in your reveal whenever you give it."]
   ],
   scored:"Counts · type (+1 total)", cmt:""},

  {id:"1.19", status:"yellow", field:"Currently: select (five types) + link to a free test",
   q:"What's your love language?",
   struck:"", opts:null,
   rows:[
    ["data","The most directly usable hosting field we have - acts of service means do something for them unprompted; words of affirmation means introduce them with a real compliment. It tells a host exactly how to make this person feel taken care of."],
    ["map","Leans a nature softly (acts of service → Caregiver, quality time → Sage), but its real value is hosting, not the tally."],
    ["score","Counts as a type - shares the +1 total, tie-break only. Named in the reveal whenever given."]
   ],
   scored:"Counts · type (+1 total)",
   cmt:"DECISION: keep it as the type only (\"Quality Time\") and hear only from people who know theirs - or also ask it plainly, \"when someone's made you feel really taken care of, what did they do?\", so we get the hosting signal from everyone. Leaning: ask it plainly."},

  {id:"1.20", status:"green", field:"Long text",
   q:"Other personality tests (StrengthsFinder, DISC, Human Design, etc.)",
   struck:"", opts:null,
   rows:[["data","Too varied to map to a nature cleanly, so it stays out of the tally - but we read it into the reveal and it can seed a hosting note when you share it. Named when given."]],
   scored:"Doesn't count · reveal color", cmt:""},

  {id:"1.21", status:"green", field:"File upload",
   q:"Have a personality-test result to share?",
   struck:"", opts:null,
   rows:[["data","A file for us and the reveal to read from. Supporting material, named when given."]],
   scored:"Doesn't count", cmt:""},
 ]},

 /* ============ SECTION 02 ============ */
 {sec:"Section 02 · How You Move Through the World", sub:"The open, in-your-own-words questions. This is where the AI does the most work - reading the answer for the nature and pulling out what we can use.", items:[
  {id:"2.1", status:"green", field:"Long text",
   q:"What's something you've become obsessed with?",
   struck:"", opts:null,
   rows:[
    ["score","Counts. AI reads it, 0 to +2. The obsession often shows the nature - a Builder obsesses over building a thing, a Sage over an idea, a Connector over people and scenes. A generic or blank answer scores 0."],
    ["data","Becomes an interest tag with intensity - the subject and how deep it runs. Three uses: seat two overlapping obsessions at one table (the highest-hit-rate way to make a stranger-pairing click); spot a pattern (eight members into natural wine is a tasting with a built-in room); and match an obsessive to a pro in that thing for a warm intro."]
   ],
   scored:"Counts · 0 to +2", cmt:""},

  {id:"2.2", status:"green", field:"Long text",
   q:"What do people consistently come to you for?",
   struck:"", opts:null,
   rows:[
    ["score","The strongest scored open answer - it maps straight to what each nature owns. \"To think something through\" = Sage (depth). \"To feel taken care of\" = Caregiver (comfort). \"To know who else they should meet\" = Connector. 0 to +2; a generic or blank answer scores 0."],
    ["map","Sage · Caregiver · Champion · Builder · Connector · Spark, depending on what you say you're the go-to for."],
    ["data","The intro engine, turned into offer-tags. When a member needs exactly what you give, we route them to you."]
   ],
   scored:"Counts · 0 to +2", cmt:""},

  {id:"2.3", status:"green", field:"Long text",
   q:"You walk into a room where you don't know anyone. What do you do?",
   struck:"", opts:null,
   rows:[
    ["map","Changed. This became six multiple-choice options and moved into In a Room. It's now a scored tap - see R2 below."],
    ["data","How you handle a cold room tells us whether to give you an ally, a role, or space."]
   ],
   scored:"Now a tap → see R2",
   cmt:"Your edit: converted and moved to In a Room. The full options and map are on R2."},

  {id:"2.4", status:"green", field:"Long text",
   q:"What's the most fun you've had recently that wasn't planned?",
   struck:"", opts:null,
   rows:[
    ["map","History, so it's on the record: on the 7/13 call we agreed to swap this for \"the best party you've been to and what made it the best.\" The next day your email reversed it - keep this original. So it stays exactly as-is. The whole trail is here if it comes up again."],
    ["score","Counts, 0 to +2 - how you make spontaneity reveals nature (builds a plan from chaos → Builder; gathers people → Spark/Connector; goes deep with one → Sage). Generic or blank = 0."],
    ["data","A note on your spontaneity style, plus the blueprint for your ideal night."]
   ],
   scored:"Counts · 0 to +2", cmt:""},

  {id:"2.5", status:"yellow", field:"Long text",
   q:"Where do you meet new people?",
   struck:"", opts:null,
   rows:[
    ["data","Best case: signals whether you're a host, a scene-goer, or a joiner, which shapes how we first bring you in."]
   ],
   scored:"Doesn't count",
   cmt:"NEEDS REVIEW: honestly the thinnest question on the form for a real move. If neither of us can name what we'd actually do with the answer, this is the one to cut. Keep or cut?"},

  {id:"2.6", status:"yellow", field:"Short text (currently required)",
   q:"Preferred workout?",
   struck:"", opts:null,
   rows:[
    ["data","No operator move comes out of it - it's trivia we can't seat, feed, or introduce on."]
   ],
   scored:"Doesn't count",
   cmt:"PROPOSED CUT. Kept visible in yellow so it's a real decision, not a silent deletion. Cut it?"},

  {id:"2.7", status:"green", field:"Long text",
   q:"How do you know when you're in good company?",
   struck:"", opts:null,
   rows:[
    ["map","Changed. Renamed to \"Describe the room when you're among good company,\" turned into six multiple-choice options, and moved into In a Room. Now a scored tap - see R3 below."],
    ["data","Your habitat - the event type that suits you and who to group you with."]
   ],
   scored:"Now a tap → see R3",
   cmt:"Your edit: renamed, converted, moved. The full options and map are on R3."},

  {id:"2.8", status:"yellow", field:"Currently long text · proposed pick-list",
   q:"Tell us about a connection or opportunity you helped create for someone else.",
   struck:"", opts:null,
   rows:[
    ["score","Counts, 0 to +2, Connector-leaning. Generic or blank = 0."],
    ["data","Your connector instinct - whether to hand you a connecting role at an event, and the kind of matches you make."]
   ],
   scored:"Counts · 0 to +2",
   cmt:"PROPOSED (not locked): convert to a pick-list - \"when you introduce two people, it's usually because…\" (they're great at what they do / they'd get along / professional fit / a friend makes a friend / I don't introduce much) plus an optional example. One story is hard to act on; the pattern is sortable. Keep open, or convert?"},

  {id:"2.9", status:"green", field:"Long text",
   q:"Tell us about a group or community you've stayed loyal to - and what keeps you there.",
   struck:"", opts:null,
   rows:[
    ["score","Counts, 0 to +2 - loyalty and belonging language leans Champion/Caregiver; \"what keeps me there\" often reveals the nature. Generic or blank = 0."],
    ["data","The retention signal - what makes you a regular, so we can recreate the belonging that keeps you coming back."]
   ],
   scored:"Counts · 0 to +2", cmt:""},

  {id:"2.10", status:"yellow", field:"Long text · AI-extracted (proposed new)",
   q:"Tell us about a time the music made the night. What was on, and what did it do to the room?",
   struck:"", opts:null,
   rows:[
    ["data","Doesn't count toward a nature - forcing one out of music taste would be noise dressed as data. It earns its slot as pure room data: AI pulls genre, energy, tempo and hard-nos → the playlist and the room's energy."]
   ],
   scored:"Doesn't count · room data",
   cmt:"NEW, proposed. Also decide placement - here in Section 2, or its own spot? An optional \"genres you can't stand\" hard-filter sits under it."},

  {id:"2.11", status:"yellow", field:"Long text · AI-extracted (proposed new)",
   q:"What's the meal that makes a gathering for you - and who's usually at the table?",
   struck:"", opts:null,
   rows:[
    ["data","Doesn't count. Pure room data: AI pulls cuisine, dietary and table size → the menu and the table."]
   ],
   scored:"Doesn't count · room data",
   cmt:"NEW, proposed. Same placement decision as music."},
 ]},

 /* ============ IN A ROOM ============ */
 {sec:"In a Room · The scored section", sub:"Tap, and most / least. This section carries the most weight in the nature. Members never see the nature names or the points - those stay behind the scenes.", items:[
  {id:"R1", status:"green", field:"Tap · pick one · +2 to one nature",
   q:"You're at a dinner party at a friend's house. Where are we most likely to find you?",
   struck:"It's 8pm at a dinner party in full swing. Where are we most likely to find you?",
   opts:[
    ["Sage","Wherever the one interesting conversation is happening, probably for most of the night"],
    ["Spark","In the middle of whatever's the most fun, starting a game or getting people to the dance floor"],
    ["Champion","Next to my person, catching up like we haven't talked in a year even if we talked yesterday"],
    ["Caregiver","In the kitchen, making sure everyone's plate and glass are full"],
    ["Builder","Off to the side with one person, deep in a conversation about what they're building"],
    ["Connector","Moving through the room, introducing two people who need to meet"]
   ],
   rows:[
    ["map","Each option points to the nature beside it: +2."],
    ["data","How you occupy a room - the most direct seating input we have."],
    ["hab","The room you gravitate to is the room we'll build around you."]
   ],
   scored:"Counts · +2 tap",
   cmt:"You rewrote the stem and all six options. Your wording is what we're using."},

  {id:"R2", status:"green", field:"Tap · pick one · +2 to one nature",
   q:"You walk into a room where you don't know anyone. What do you do?",
   struck:"Was in Section 2 as an open text answer - now a tap, moved here.",
   opts:[
    ["Sage","Find a quiet corner and wait for one person worth talking to"],
    ["Spark","Introduce myself to the nearest group within a minute"],
    ["Champion","Find whoever looks most alone and make them feel like an old friend"],
    ["Caregiver","Find the host and ask what needs doing"],
    ["Builder","Scan the room for someone worth the conversation, then commit fully to that one"],
    ["Connector","Work the edges, picking up names and connections before diving in anywhere"]
   ],
   rows:[
    ["map","Each option points to the nature beside it: +2."],
    ["data","How you handle a cold room → whether to give you an ally, a role, or space."]
   ],
   scored:"Counts · +2 tap",
   cmt:"You converted this from the open Section-2 version and gave the six options and the map."},

  {id:"R3", status:"green", field:"Tap · pick one · +2 to one nature",
   q:"Describe the room when you're among good company.",
   struck:"How do you know when you're in good company?",
   opts:[
    ["Sage","Quiet enough that one real conversation can go all night"],
    ["Spark","Full of energy, movement, and permission to play"],
    ["Champion","Full of faces I already love"],
    ["Caregiver","Warm, and I've got something to tend - a table, a role, a corner that's mine"],
    ["Builder","Going somewhere, full of people worth building with"],
    ["Connector","Full of people who don't know each other yet, but should"]
   ],
   rows:[
    ["map","Each option points to the nature beside it: +2."],
    ["hab","The strongest room question - it directly names the room you thrive in."],
    ["data","Event type, and who to group you with."]
   ],
   scored:"Counts · +2 tap",
   cmt:"You renamed, converted, and moved this. Your wording is what we're using."},

  {id:"R4", status:"yellow", field:"Tap · pick one · +2 to one nature",
   q:"Someone brings up something that's clearly weighing on them. What do you do?",
   struck:"Brand-new question.",
   opts:[
    ["Sage","Ask one good question and actually listen to the whole answer"],
    ["Spark","Lighten the mood in the moment, then circle back one on one later"],
    ["Champion","Drop everything and give them full attention right there"],
    ["Caregiver","Quietly get them food, water, a seat away from the noise"],
    ["Builder","Offer a way to think about it - a next step, a plan"],
    ["Connector","Think of who they should meet who's been through the same thing"]
   ],
   rows:[
    ["map","Each option points to the nature beside it: +2."],
    ["data","Your care style - who to seat near someone having a hard night, and how you'll look after the room."]
   ],
   scored:"Counts · +2 tap",
   cmt:"You proposed this as an add. Confirm we're adding it and it turns Locked - Undecided until you say yes."},

  {id:"R5", status:"green", field:"Most / least · +2 most, −1 least",
   q:"In a room, your gift is making…",
   struck:"",
   opts:[
    ["Spark","…the night fun"],
    ["Caregiver","…the space feel like home"],
    ["Sage","…the conversation deeper"],
    ["Connector","…the right people meet"],
    ["Champion","…one person feel like the only person in the room"],
    ["Builder","…ambitious things feel possible"]
   ],
   rows:[
    ["live","These are the real options from the live app - the wording and the nature map now match it. Nothing here for you to rewrite."],
    ["data","Your signature effect on a room - so we can build a table where every seat brings a different gift."]
   ],
   scored:"Counts · +2 most / −1 least",
   cmt:"Wording is set. The options and their nature map now match the live app."},

  {id:"R6", status:"green", field:"Most / least · +2 most, −1 least",
   q:"What's most likely to actually ruin a party for you, and what would you let slide?",
   struck:"What do you secretly judge a party for?",
   opts:[
    ["Spark","Low energy"],
    ["Caregiver","Bad hospitality"],
    ["Sage","Shallow conversation"],
    ["Connector","Everyone in the room already knows each other"],
    ["Champion","Nobody's really listening to each other"],
    ["Builder","No purpose to the gathering"]
   ],
   rows:[
    ["map","Your \"most\" points to the nature beside it (+2); the one you'd let slide is −1. Signal order: Spark · Caregiver · Sage · Connector · Champion · Builder."],
    ["data","Your dealbreaker - what we protect against for you, and what we know we can let go."]
   ],
   scored:"Counts · +2 most / −1 least",
   cmt:"You rewrote the stem and all six options and gave the order and scoring. Your wording is what we're using."},

  {id:"R7", status:"green", field:"Tap · pick one · +2 to one nature",
   q:"Pick your perfect Friday night.",
   struck:"",
   opts:[
    ["Spark","A house party with great music that goes late"],
    ["Caregiver","Hosting a table of six, menu planned days ago"],
    ["Sage","A three-hour dinner with one or two brilliant people"],
    ["Connector","A room full of people who've never met, and should"],
    ["Champion","The standing dinner where everyone already knows everyone"],
    ["Builder","A salon, a tasting, a dinner with a theme"]
   ],
   rows:[
    ["live","These are the real options from the live app - the wording is set."],
    ["map","Each option points to the nature beside it: +2. Signal order: Spark · Caregiver · Sage · Connector · Champion · Builder."],
    ["data","Event targeting - which of our events to invite you to."]
   ],
   scored:"Counts · +2 tap",
   cmt:"Wording is set. Split from the old combined pick-and-skip card; the skip is its own card below."},

  {id:"R7b", status:"green", field:"Tap · pick one · −2 to one nature",
   q:"Now the one you'd politely skip. Same list. What you'd pass on says as much as what you'd pick.",
   struck:"",
   opts:[
    ["Spark","A house party with great music that goes late"],
    ["Caregiver","Hosting a table of six, menu planned days ago"],
    ["Sage","A three-hour dinner with one or two brilliant people"],
    ["Connector","A room full of people who've never met, and should"],
    ["Champion","The standing dinner where everyone already knows everyone"],
    ["Builder","A salon, a tasting, a dinner with a theme"]
   ],
   rows:[
    ["live","Same six options as the pick card - the wording is set."],
    ["map","Each option points to the nature beside it: −2. Signal order: Spark · Caregiver · Sage · Connector · Champion · Builder."],
    ["data","Event targeting - which events to spare you."]
   ],
   scored:"Counts · −2 tap",
   cmt:"Split out from the old combined pick-and-skip card so the skip never reads as optional."},

  {id:"R8", status:"green", field:"Tap · pick one · +2 to one nature",
   q:"At your absolute best in a room, people would say you were…",
   struck:"",
   opts:[
    ["Spark","Magnetic"],
    ["Caregiver","The reason it felt like home"],
    ["Sage","The best conversation there"],
    ["Connector","The night's best introduction"],
    ["Champion","Someone's whole cheering section"],
    ["Builder","The reason they finally started something"]
   ],
   rows:[
    ["live","These are the real options from the live app - the wording and the nature map now match it."],
    ["data","Your peak role in a room - and this is the line your reveal opens with, in your own words. Load-bearing for the reveal."]
   ],
   scored:"Counts · +2 tap",
   cmt:"Wording is set. The options and their nature map now match the live app."},
 ]},

 /* ============ SECTION 03 ============ */
 {sec:"Section 03 · Who You'd Bring In", sub:"", items:[
  {id:"3.1", status:"green", field:"Long text",
   q:"Who's someone you think we should meet?",
   struck:"", opts:null,
   rows:[["data","Doesn't count - pure pipeline. It's the nomination that feeds who comes next, and it credits the member who brought them."]],
   scored:"Doesn't count", cmt:""},
 ]},

 /* ============ HOUSE RULES ============ */
 {sec:"House Rules · The consent close", sub:"", items:[
  {id:"—", status:"green", field:"Terms checkbox + two optional opt-ins + submit",
   q:"A few house rules",
   struck:"", opts:null,
   rows:[["data","Not part of this pass. It's frozen legal copy waiting on attorney review, and the email and SMS opt-ins feed the consent record - a separate lane from the questions."]],
   scored:"Doesn't count", cmt:""},
 ]},
];

/* ---------- NATURES (reference · verbatim from archetypes-v3-chloe-final) ---------- */
// `dim` and `edge` intentionally omitted — positive framing only (Chloe's rule).
export type Nature = {
  animal: string;
  nature: string;
  own: string;
  essence: string;
  ex: string;
  inroom: string;
  thrive: string;
  peak: string;
  host: string;
};

export const NATURES: Nature[] = [
 {animal:"The Owl", nature:"Sage", own:"Owns: depth",
  essence:"The Owl collects understanding, not attention. They leave every conversation knowing more than they arrived with, and so does the person they talked to.",
  ex:"<b>Emily</b> doesn't work the room. At a dinner for twelve she found the one guest everyone else had written off as quiet, asked what he was actually working on, and three hours later they were the conversation the whole table wished they'd been in.",
  inroom:"They arrive without announcement and find one conversation worth having. They listen longer than anyone, ask the question nobody else thought of, and remember your answer months later. Comfortable with silence, immune to the pressure to perform. You won't find them working the room - you'll find the room's most interesting conversation happening wherever they sat down.",
  thrive:"Small seated dinners. Long conversations with one or two people. Rooms built around a question worth answering.",
  peak:"With the right people and the right song, the Owl surprises everyone: talkative, playful, first on the dance floor. Depth was never shyness, it was selectivity.",
  host:"Seat them next to your most interesting guest, not your most social one. Give them one great pairing and they'll deliver the conversation people talk about on the drive home. Never make them open the room."},

 {animal:"The Dolphin", nature:"Spark", own:"Owns: momentum",
  essence:"The Spark is why the room comes alive. Their joy is genuine, contagious, and impossible to ignore. People remember how they felt around them.",
  ex:"<b>Bunny</b> walks in and the room warms ten degrees. She started the toast, invented a game nobody knew they needed, and had the shyest person there on the dance floor by ten.",
  inroom:"First to smile, first to introduce themselves, first to make a stranger feel like a regular. They gather people into a moment - the toast, the game, the story everyone joins - and pull quiet guests into the circle without making it feel like a rescue. Their arrival is noticed. So is their departure.",
  thrive:"Big-energy rooms. House parties, celebrations, dance floors, any gathering with movement and permission to play.",
  peak:"The Spark turns the spotlight outward, hyping other people until the whole room feels like the guest of honor.",
  host:"Ration them. One Spark per table is seasoning; a room of all Sparks burns hot and connects shallow. Place them where the energy needs insurance, farthest from the host, next to the shyest cluster."},

 {animal:"The Dog", nature:"Champion", own:"Owns: devotion",
  essence:"The Champion makes you feel like the most important person in the room. They don't just support people, they celebrate them - out loud, to your face and behind your back.",
  ex:"<b>Marcus</b> greets you like you personally made his night by showing up. Before you've got a drink he's told three people what you're building and why they have to meet you.",
  inroom:"They greet you like the night just started because you arrived. Undivided attention in an age of half attention: no scanning over your shoulder, no waiting for their turn to talk. And they brag about the people they love - the one saying \"you have to hear what she's building\" before you can introduce yourself. They anchor one corner and make it the warmest spot in the room.",
  thrive:"Familiar rooms. Recurring dinners, small groups with returning faces, anywhere trust has time to compound.",
  peak:"The Champion becomes the room's amplifier, turning their hype outward and introducing people through pure celebration of both.",
  host:"Your retention engine - they're why people come back. Always seat them with at least one person they know, then add one newcomer who needs an ally. They convert first-timers into regulars."},

 {animal:"The Bear", nature:"Caregiver", own:"Owns: comfort",
  essence:"The Caregiver makes a space feel like home. Their instinct is nourishment: has everyone eaten, is anyone stranded, does the room feel warm.",
  ex:"<b>Nadia</b> clocked the guy stranded in the corner with no drink and the friend who'd clearly skipped dinner before anyone else did. By the end of the night she'd fed both, and neither knew she'd been keeping count.",
  inroom:"They host, whether or not it's their house. They notice the empty glass, the guest hovering at the edge, the coat with nowhere to go, moving through the room in slow patrols where every stop feels personal. Where the Champion focuses on one person, the Bear tends the whole den.",
  thrive:"Rooms where they have a role. Their own table, a co-host seat, the kitchen at a house party. Give a Bear something to tend and they glow.",
  peak:"The Bear's care turns celebratory: the den becomes a party and the host becomes its warmest light.",
  host:"Deputize them. Give the Bear a corner of the night to own - the welcome, the wine, the last course - and they'll outperform your staff. Your best co-hosts and future event partners."},

 {animal:"The Beaver", nature:"Builder", own:"Owns: vision",
  essence:"The Builder is the architect of ecosystems. They don't adapt to their environment, they reshape it, and everything around them lives better because they did.",
  ex:"<b>Theo</b> skipped the small talk and asked what you're building and how he can help. You left wanting to finally start the thing you'd been sitting on - and he'd already texted you two intros.",
  inroom:"Ambition without volume. Not the loudest voice or the busiest circulator - the one assessing whether this room is worth their time, because they value their hours the way other people value money. Their opening question isn't \"what do you do,\" it's \"what are you building\" and \"how can I help.\" They give away ideas, intros and blueprints freely. You leave their conversation wanting to start the business, write the book, finally begin.",
  thrive:"Rooms with substance. Salons, themed dinners, gatherings where ambition is welcome at the table. The Builder shows up fully when the room is going somewhere.",
  peak:"The Builder opens the ecosystem: their ideas, their people, their playbook, all offered to whoever's serious.",
  host:"Give the night a spine - a question, a theme, a show-and-tell - and Builders carry it. Seat them across from each other and watch a collaboration form by dessert."},

 {animal:"The Bee", nature:"Connector", own:"Owns: the introduction",
  essence:"The Connector sees the invisible threads between people. Their question is never \"what do you do,\" it's \"who should you meet.\"",
  ex:"<b>Priya</b> spent the night making pairs. She pulled a founder and a designer into the same corner, told each exactly why the other mattered, and slipped away before the conversation even got going.",
  inroom:"They circulate more than anyone, but not for coverage - for matchmaking. They scan for the new face, the hidden talent, the two guests who don't know they're about to be partners, then make the intro framed with exactly why these two matter to each other, and step away to let it grow. Where the Spark gathers a crowd, the Bee builds a bridge and moves on.",
  thrive:"Mixed rooms. New faces, crossed industries, guest lists with range. The more unlikely the combinations, the happier the Bee.",
  peak:"The Bee slows down and goes deep, staying in one conversation long enough to understand someone completely - which makes their next introduction devastating in its accuracy.",
  host:"Brief them like a partner. Tell the Bee who's coming and who you hope meets, and they'll do half your curation for you. Refresh their supply - Bees need new faces or they lose their reason to come."}
];
