'use client';

// Chloe's application-quiz review tool. Faithful port of
// nobc-application-review-v2.html: three tabs (Questions / Reveal / Natures),
// click-to-edit cards, colored status buttons, KEY panel, Export / Import.
// The Questions tab autosaves (debounced ~800ms) to Postgres via a server
// action; Reveal and Natures are static reference views.

import { useCallback, useRef, useState } from 'react';
import {
  NATURES,
  SEED,
  type MappedOption,
  type ReviewItem,
  type ReviewSection,
  type ReviewStatus,
} from './data';
import { saveApplicationReview } from './actions';
import './review.css';

const TAGLABEL: Record<string, string> = {
  score: 'Score',
  data: 'We do',
  map: 'Maps to',
  hab: 'The room',
  live: 'From live app',
};

const DEBOUNCE_MS = 800;

function isMapped(opts: string[] | MappedOption[]): opts is MappedOption[] {
  return Array.isArray(opts[0]);
}

export function ReviewClient({ initialData }: { initialData: unknown }) {
  const [data, setData] = useState<ReviewSection[]>(() =>
    Array.isArray(initialData) && initialData.length > 0
      ? (initialData as ReviewSection[])
      : structuredClone(SEED)
  );
  const [view, setView] = useState<'q' | 'r' | 'n'>('q');
  const [saveMsg, setSaveMsg] = useState('saved');

  const dataRef = useRef(data);
  const pending = useRef<ReviewSection[] | null>(null);
  const inFlight = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((t: string) => {
    setSaveMsg('· ' + t + ' ·');
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaveMsg('saved'), 1400);
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current) return; // rescheduled below when the current save lands
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    inFlight.current = true;
    let ok = false;
    try {
      const res = await saveApplicationReview(payload);
      ok = res.ok;
    } catch {
      ok = false;
    }
    inFlight.current = false;
    if (!ok) {
      // Keep the newest unsaved copy; the next edit re-queues. Export stays
      // the honest fallback, same as the original tool.
      pending.current = pending.current ?? payload;
      setSaveMsg('save failed — export ↓');
      return;
    }
    if (pending.current) {
      saveTimer.current = setTimeout(flush, DEBOUNCE_MS); // edits arrived mid-save
    } else {
      flash('saved');
    }
  }, [flash]);

  const queueSave = useCallback(
    (next: ReviewSection[]) => {
      pending.current = next;
      setSaveMsg('· saving ·');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush]
  );

  const update = useCallback(
    (mutate: (draft: ReviewSection[]) => void) => {
      const next = structuredClone(dataRef.current);
      mutate(next);
      dataRef.current = next;
      setData(next);
      queueSave(next);
    },
    [queueSave]
  );

  function commitField(si: number, ii: number, f: 'q' | 'struck' | 'field' | 'cmt', html: string) {
    if (dataRef.current[si]?.items[ii]?.[f] === html) return;
    update((d) => {
      d[si].items[ii][f] = html;
    });
  }

  function commitRow(si: number, ii: number, ri: number, html: string) {
    if (dataRef.current[si]?.items[ii]?.rows[ri]?.[1] === html) return;
    update((d) => {
      d[si].items[ii].rows[ri][1] = html;
    });
  }

  function setStatus(si: number, ii: number, v: ReviewStatus) {
    update((d) => {
      d[si].items[ii].status = v;
    });
  }

  function addQ(si: number) {
    update((d) => {
      d[si].items.push({
        id: 'new',
        status: 'yellow',
        field: '(set field type)',
        q: 'New question - type it here',
        struck: '',
        opts: null,
        rows: [['data', 'What do we do with this answer?']],
        scored: '(counts? points?)',
        cmt: 'Added by reviewer.',
      });
    });
    setTimeout(() => {
      document.querySelectorAll('.arv-sec')[si]?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 60);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nobc-application-review-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    flash('exported ↓');
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        if (!Array.isArray(parsed)) throw new Error('not an array');
        dataRef.current = parsed as ReviewSection[];
        setData(parsed as ReviewSection[]);
        queueSave(parsed as ReviewSection[]);
        flash('imported');
      } catch {
        alert("That file didn't read as valid review data.");
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  function showView(v: 'q' | 'r' | 'n') {
    setView(v);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="arv">
      <div className="arv-bar">
        <div className="arv-brand">
          No Bad Company<span>Application review</span>
        </div>
        <div className="arv-tabs">
          <button className={view === 'q' ? 'arv-on' : ''} onClick={() => showView('q')}>Questions</button>
          <button className={view === 'r' ? 'arv-on' : ''} onClick={() => showView('r')}>Reveal</button>
          <button className={view === 'n' ? 'arv-on' : ''} onClick={() => showView('n')}>Natures</button>
        </div>
        <button className="arv-tool" onClick={exportJSON}>Export ↓</button>
        <label className="arv-tool" style={{ cursor: 'pointer' }}>
          Import ↑
          <input type="file" accept="application/json" onChange={importJSON} style={{ display: 'none' }} />
        </label>
        <span className="arv-save">{saveMsg}</span>
      </div>

      <main className="arv-wrap">
        {/* ===== QUESTIONS VIEW ===== */}
        <div style={{ display: view === 'q' ? 'block' : 'none' }}>
          <div className="arv-lead">
            <h1>Every question, what it&apos;s for, and how it scores.</h1>
            <p>
              One rule runs all of it: <b>a question earns its place only if we can do something with the answer</b> - seat
              someone, set the room, build a menu or a playlist, make an intro. Most questions also feed the nature; the few
              that don&apos;t have to earn their spot with a concrete, usable answer.
            </p>
            <p>
              Edit anything by clicking on it - it saves as you go. Set a status, mark old wording, add a question, leave a
              note. When you&apos;re done, hit <b>Export</b> and send the file back to Adam so nothing gets lost in translation.
            </p>
          </div>

          {/* KEY */}
          <div className="arv-key">
            <h4>Key · what the tags mean</h4>
            <div className="arv-keygrid">
              <div className="arv-keyrow">
                <span className="arv-kt arv-score">Score</span>
                <div className="arv-kd">
                  <b>Does this answer count toward a nature, and how many points.</b> If it counts, the exact points are on
                  the card. If it doesn&apos;t, the card says &quot;Doesn&apos;t count.&quot;
                </div>
              </div>
              <div className="arv-keyrow">
                <span className="arv-kt arv-data">We do</span>
                <div className="arv-kd">
                  <b>What we actually do with the answer.</b> Seat you, set the room, plan the menu and the playlist, make
                  the intro. (Shown as the darker tag.)
                </div>
              </div>
              <div className="arv-keyrow">
                <span className="arv-kt arv-map">Maps to</span>
                <div className="arv-kd">
                  <b>Which answer option points to which nature.</b> Only appears on the multiple-choice room questions.
                </div>
              </div>
              <div className="arv-keyrow">
                <span className="arv-kt arv-hab">The room</span>
                <div className="arv-kd">
                  <b>The room we&apos;ll say you thrive in</b> - written into your reveal in your own words.
                </div>
              </div>
            </div>
            <div className="arv-keydiv"></div>
            <div className="arv-keystatus">
              <div className="arv-s">
                <i style={{ background: 'var(--green)' }}></i>
                <div><b>Locked</b> - settled, going in as written.</div>
              </div>
              <div className="arv-s">
                <i style={{ background: 'var(--yellow)' }}></i>
                <div><b>Undecided</b> - a real open question. The card says what&apos;s undecided.</div>
              </div>
              <div className="arv-s">
                <i style={{ background: 'var(--red)' }}></i>
                <div><b>Cut</b> - proposed for removal. Struck through so it&apos;s a decision, not a silent delete.</div>
              </div>
            </div>
          </div>

          <details className="arv-model">
            <summary>The scoring model &amp; the case for the natures <span className="arv-x">+</span></summary>
            <div className="arv-body">
              <h5>What sets the nature</h5>
              <p>
                Everything that can honestly show how you&apos;d walk into a room contributes - not just the six tap questions.
                The room questions carry the most weight; the open written answers get read by AI and add to the tally; the
                personality types add a small, capped nudge. Only pure logistics and pure room data (music, food, dietary,
                referrals, nomination) stay out of the nature entirely.
              </p>
              <h5>Point scheme</h5>
              <ul>
                <li><b>Room taps</b> (dinner party, walk-in, describe-the-room, weighing, at-your-best): <b>+2</b> to one nature.</li>
                <li><b>Most / least</b> (gift-is-making, ruins-a-party): <b>+2</b> for most, <b>−1</b> for least.</li>
                <li><b>Perfect Friday</b> (pick + skip, both required): <b>+2</b> for your pick, <b>−1</b> for the one you&apos;d pass on.</li>
                <li><b>Open written answers:</b> AI reads each one and gives <b>0, +1, or +2</b>. A generic or blank answer scores <b>0</b> and counts for nothing. Capped low so a long answer can&apos;t drown out a clean tap.</li>
                <li><b>Personality types:</b> at most <b>+1 total</b> across every type you give, and only enough to break a tie between two close natures - never enough to override how you actually moved in the room.</li>
              </ul>
              <h5>How the AI grades an open answer (0, +1, +2)</h5>
              <p>
                <b>+2</b> - it specifically embodies one nature (&quot;people come to me to think things through&quot; is Sage,
                because depth is what only Sage owns). <b>+1</b> - it leans one but stays general. <b>0</b> - generic or
                blank, no signal, counts for nothing. It can split +1/+1 when an answer honestly straddles two. Temperature
                is set to zero, so the same answer always scores the same - the fix for a result that once came out two
                different ways.
              </p>
              <h5>Why the types matter but don&apos;t decide</h5>
              <p>
                The Enneagram, Myers-Briggs and love language describe how a person is wired across their whole life -
                alone, at work, anywhere. The nature answers the one thing none of them were built for: <b>how someone
                shows up in a room, with other people, on a night that matters.</b> An Enneagram 8 might be the Champion
                who makes one guest feel like the only person there, or the Builder quietly weighing whether the night&apos;s
                worth their hours - the 8 can&apos;t tell you which; the room can. So when a member hands us a type, we always
                read it back to them and let it strengthen the case - ignoring what someone tells you about themselves is
                the opposite of hospitality. But we lead with the nature, because it&apos;s the only read in the pile that tells
                us where to seat you, what to feed you, and who you need to meet. Every other test tells you about
                yourself. Ours tells us how to take care of you.
              </p>
              <p style={{ color: 'var(--yellow)' }}>
                <b>Naming a shared type in the reveal is a hard rule</b> - if a member gives it, the AI names it.
              </p>
            </div>
          </details>

          <div>
            {data.map((section, si) => (
              <section className="arv-sec" key={si}>
                <div className="arv-sec-head">
                  <span className="arv-lbl">{section.sec}</span>
                  <button className="arv-add" onClick={() => addQ(si)}>+ Question</button>
                </div>
                {section.sub ? <div className="arv-sec-sub">{section.sub}</div> : null}
                {section.items.map((it, ii) => (
                  <QuestionCard
                    key={ii}
                    it={it}
                    si={si}
                    ii={ii}
                    commitField={commitField}
                    commitRow={commitRow}
                    setStatus={setStatus}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>

        {/* ===== REVEAL VIEW ===== */}
        <div style={{ display: view === 'r' ? 'block' : 'none' }}>
          <div className="arv-rvintro">
            <h2>The reveal, reworked.</h2>
            <p>
              What a member sees at the end. The old version led with a label and a stack of percentages, carried an &quot;edge&quot;
              that talked about people at their worst, and read the same for everyone. The new one is built from their own
              answers.
            </p>
          </div>

          <div className="arv-changed">
            <div className="arv-c">
              <span className="arv-k">Blend</span>
              <div>
                <del>Sage 78% · Connector 22%</del>&nbsp;&nbsp;→&nbsp;&nbsp;leaning language:{' '}
                <b>&quot;An Owl, leaning Dolphin&quot;</b> - or just &quot;An Owl&quot; when it&apos;s clean. No numbers.
              </div>
            </div>
            <div className="arv-c">
              <span className="arv-k">Accuracy</span>
              <div>Temperature-zero scoring, so the same answers always land the same nature. The fix for a result that came out two different ways.</div>
            </div>
            <div className="arv-c">
              <span className="arv-k">No edge</span>
              <div>The &quot;at your edge, you go silent and find the door&quot; line is gone. Only who they are at their best.</div>
            </div>
            <div className="arv-c">
              <span className="arv-k">Personal</span>
              <div>The room they thrive in, and the whole read, are written from their actual answers - not a template.</div>
            </div>
            <div className="arv-c">
              <span className="arv-k">Types</span>
              <div>Their Enneagram, love language and Human Design get named and woven into the case for their nature.</div>
            </div>
            <div className="arv-c">
              <span className="arv-k">Photo</span>
              <div>Their first uploaded photo opens the reveal - a face on the nature.</div>
            </div>
          </div>

          <div className="arv-reveal">
            <div className="arv-rvhead">
              <div className="arv-photo">First uploaded<br />photo</div>
              <div>
                <div className="arv-eyebrow">At your best, you&apos;re the best conversation in the room</div>
                <h1>The Owl</h1>
                <div className="arv-lean">An Owl, leaning Dolphin</div>
              </div>
            </div>
            <div className="arv-rvbody">
              <p className="arv-essence">
                You don&apos;t collect attention. You collect understanding - and you leave every conversation knowing more than
                you walked in with, and so does the person across from you.
              </p>

              <div className="arv-blk">
                <div className="arv-lab">Where you thrive</div>
                <p>
                  Your best rooms look like the one you told us about - <em>a long dinner that becomes the only
                  conversation you remember.</em> You come alive at a small seated table built around something worth
                  talking about. You go quiet, not out of shyness, in a loud standing room with thirty first introductions
                  - so we won&apos;t put you there.
                </p>
              </div>

              <div className="arv-blk">
                <div className="arv-lab">At your peak</div>
                <p>
                  With the right people and the right song on, you surprise everyone - talkative, playful, first on the
                  dance floor. The depth was never shyness. It was selectivity. When you choose a room, you&apos;re all the way
                  in it.
                </p>
              </div>

              <div className="arv-blk">
                <div className="arv-lab">Why this is you</div>
                <p>
                  You told us that when you walk into a room, you <em>read it first</em> - who&apos;s performing, who&apos;s actually
                  listening - before you find the one person worth a real conversation. That&apos;s not hanging back. It&apos;s
                  discernment, and it&apos;s the whole reason people end up trusting you with what they don&apos;t say out loud.
                </p>
              </div>

              <div className="arv-blk">
                <div className="arv-lab">What you told us about yourself</div>
                <p>
                  You shared that you&apos;re an <em>Enneagram 5</em> and that your love language is <em>Quality Time</em> - and
                  both make the Owl in you make sense. You go deep before you go wide, and one real conversation will
                  always beat a room full of small talk. It&apos;s also why the Dolphin only shows up once you&apos;ve chosen your
                  people: your energy is real, you just spend it on purpose.
                </p>
              </div>

              <div className="arv-foot">The Owl, with a Dolphin streak.</div>
            </div>
          </div>

          <p style={{ color: 'var(--ink-soft)', fontSize: '13.5px', marginTop: '18px', fontStyle: 'italic' }}>
            Sample built from a real answer set. Copy and layout are the direction, not final - the copy is Chloe&apos;s to shape.
          </p>
        </div>

        {/* ===== NATURES VIEW ===== */}
        <div style={{ display: view === 'n' ? 'block' : 'none' }}>
          <div className="arv-natlead">
            <h2>The six natures.</h2>
            <p>
              Your final copy, exactly as written - so you can see what every scored question is aiming at. Members meet
              these as <b>animals</b>; the scoring works in <b>natures</b>. The named examples are illustrations to make
              each one land - swap them freely. The blue &quot;Host notes&quot; are operator-only - members never see them.
            </p>
          </div>
          <div>
            {NATURES.map((n) => (
              <div className="arv-natcard" key={n.nature}>
                <div className="arv-nathead">
                  <span className="arv-animal">{n.animal}</span>
                  <span className="arv-nature">{n.nature}</span>
                  <span className="arv-own">{n.own}</span>
                </div>
                <div className="arv-essence">{n.essence}</div>
                <div className="arv-example">
                  <span className="arv-egl">Example</span>
                  <span dangerouslySetInnerHTML={{ __html: n.ex }} />
                </div>
                <div className="arv-natblk"><span className="arv-l">In the room</span><span className="arv-t">{n.inroom}</span></div>
                <div className="arv-natblk"><span className="arv-l">Thrives in</span><span className="arv-t">{n.thrive}</span></div>
                <div className="arv-natblk"><span className="arv-l">At their best</span><span className="arv-t">{n.peak}</span></div>
                <div className="arv-natblk arv-host"><span className="arv-l">Host notes</span><span className="arv-t">{n.host}</span></div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="arv-footer">
        <div className="arv-legendbar">
          <span><i style={{ background: 'var(--green)' }}></i> Locked · going in</span>
          <span><i style={{ background: 'var(--yellow)' }}></i> Undecided · reason on the card</span>
          <span><i style={{ background: 'var(--red)' }}></i> Cut · struck through</span>
        </div>
      </footer>
    </div>
  );
}

function QuestionCard({
  it,
  si,
  ii,
  commitField,
  commitRow,
  setStatus,
}: {
  it: ReviewItem;
  si: number;
  ii: number;
  commitField: (si: number, ii: number, f: 'q' | 'struck' | 'field' | 'cmt', html: string) => void;
  commitRow: (si: number, ii: number, ri: number, html: string) => void;
  setStatus: (si: number, ii: number, v: ReviewStatus) => void;
}) {
  return (
    <div className={`arv-q${it.status === 'yellow' ? ' arv-st-yellow' : ''}${it.status === 'red' ? ' arv-st-red' : ''}`}>
      <div className="arv-qtop">
        <span className="arv-qid">{it.id}</span>
        <div className="arv-ctrls">
          <span className="arv-pill">{it.scored}</span>
          <div className="arv-statusset">
            <button
              className={`arv-stbtn arv-go${it.status === 'green' ? ' arv-on' : ''}`}
              onClick={() => setStatus(si, ii, 'green')}
            >
              Locked
            </button>
            <button
              className={`arv-stbtn arv-hold${it.status === 'yellow' ? ' arv-on' : ''}`}
              onClick={() => setStatus(si, ii, 'yellow')}
            >
              Undecided
            </button>
            <button
              className={`arv-stbtn arv-cut${it.status === 'red' ? ' arv-on' : ''}`}
              onClick={() => setStatus(si, ii, 'red')}
            >
              Cut
            </button>
          </div>
        </div>
      </div>
      <div className="arv-qbody">
        {it.struck ? (
          <div className="arv-struck">
            <span className="arv-wasLbl">was</span>
            <span
              className="arv-wasTxt"
              contentEditable
              onBlur={(e) => commitField(si, ii, 'struck', e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: it.struck }}
            />
          </div>
        ) : null}
        <h3
          contentEditable
          onBlur={(e) => commitField(si, ii, 'q', e.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: it.q }}
        />
        <div
          className="arv-field"
          contentEditable
          onBlur={(e) => commitField(si, ii, 'field', e.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: it.field }}
        />
        {it.opts ? (
          isMapped(it.opts) ? (
            <div className="arv-opts">
              <div className="arv-ol">Answer options → nature</div>
              <ul className="arv-optlist">
                {it.opts.map((o, oi) => (
                  <li key={oi}>
                    <span className="arv-nat">{o[0]}</span>
                    {o[1]}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="arv-opts">
              <div className="arv-ol">Answer options · wording is set</div>
              <ol className="arv-optlist arv-plain">
                {it.opts.map((o, oi) => (
                  <li key={oi}>{o}</li>
                ))}
              </ol>
            </div>
          )
        ) : null}
        <div className="arv-rows">
          {it.rows.map((r, ri) => (
            <div className="arv-row" key={ri}>
              <span className={`arv-tag arv-${r[0]}`}>{TAGLABEL[r[0]] || r[0]}</span>
              <div
                className="arv-v"
                contentEditable
                onBlur={(e) => commitRow(si, ii, ri, e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: r[1] }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="arv-cmt">
        <div className="arv-ol">Note / decision</div>
        <div
          className="arv-box"
          contentEditable
          onBlur={(e) => commitField(si, ii, 'cmt', e.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: it.cmt || '' }}
        />
      </div>
    </div>
  );
}
