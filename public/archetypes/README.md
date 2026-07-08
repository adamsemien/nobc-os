# Nature art — reveal illustrations

The apply reveal renders the applicant's **primary nature** illustration here, mapped
by the **stored enum** (lowercased): `archetypeArtSrc()` in
`app/apply/_components/MembershipForm.tsx` resolves to `/archetypes/{enum}.png`.

## Drop the six files at these EXACT names

| File to drop        | Animal      | Nature (member sees) | Stored enum |
| ------------------- | ----------- | -------------------- | ----------- |
| `builder.png`       | Beaver      | Builder              | `Builder`   |
| `spark.png`         | Dolphin     | Spark                | `Spark`     |
| `patron.png`        | Dog         | Champion             | `Patron`    |
| `host.png`          | Bear        | Caregiver            | `Host`      |
| `connector.png`     | Bee (bridge)| Connector            | `Connector` |
| `sage.png`          | Owl         | Sage                 | `Sage`      |

Note the two legacy-named enums: **Champion → `patron.png`**, **Caregiver → `host.png`**.
Rename Adam's exports accordingly and drop them in this folder.

## Rendering (already wired)

- The reveal `<img>` uses `mix-blend-mode: multiply`. The art is **black line art on
  cream** — multiply drops the cream optically against the reveal background so the
  black linework sits on top. **Do not recolor the art and do not knock out / bake a
  background** — ship the black-on-cream file as-is.
- Until a file is present, the slot hides itself (`onError`) — no broken image.
- Convention is `.png`. If you must use a different extension, update `archetypeArtSrc()`.

## ⚠️ Contrast check on the reveal background

The reveal background token is `--bg-reveal: #120f1e` (a near-black dark plum). Multiply
of the **cream field** over it reads clean, but **black linework over a near-black field
has very low contrast** — verify the linework is actually visible once the real art is
in. If it disappears, options (design decision): render the art on a lighter plate,
deliver light-on-dark linework, or lighten `--bg-reveal` behind the art. Flagged for Adam.
