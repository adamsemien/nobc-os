import { db } from "../lib/db"

async function main() {
  const events = await db.event.findMany({
    select: {
      id: true,
      slug: true,
      accessMode: true,
      applyMode: true,
      approvalRequired: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
      eventAccess: true,
    },
  })

  let updated = 0
  let skipped = 0

  for (const e of events) {
    const existing = e.eventAccess as any
    const looksLikeDefault =
      existing?.member?.gate === "auto_confirm" &&
      existing?.member?.priceCents === 0 &&
      existing?.guest?.enabled === false &&
      existing?.comp?.enabled === false

    if (!looksLikeDefault) {
      skipped++
      continue
    }

    const memberPrice = e.priceInCents ?? 0
    const guestPrice = e.nonMemberPriceInCents ?? 0
    const needsApproval = e.approvalRequired ?? false

    let memberEnabled = true
    let memberGate = "auto_confirm"
    let guestEnabled = false
    let guestGate = "pay"

    switch (e.accessMode) {
      case "OPEN":
        memberGate = needsApproval ? "questions_approval" : "auto_confirm"
        guestEnabled = false
        break
      case "TICKETED":
        memberGate = memberPrice > 0 ? "pay" : "auto_confirm"
        guestEnabled = guestPrice > 0
        guestGate = "pay"
        break
      case "APPLY_OR_PAY":
        memberGate = needsApproval ? "questions_approval" : "auto_confirm"
        guestEnabled = true
        guestGate = needsApproval ? "apply" : "pay"
        break
    }

    await db.event.update({
      where: { id: e.id },
      data: {
        eventAccess: {
          member: { enabled: memberEnabled, gate: memberGate, priceCents: memberPrice },
          guest: { enabled: guestEnabled, gate: guestGate, priceCents: guestPrice },
          comp: { enabled: false, budgetCap: null },
        },
      },
    })

    updated++
    console.log(`  ${e.slug}: ${e.accessMode} → member=${memberGate} guest=${guestEnabled ? guestGate : "off"}`)
  }

  console.log(`\nBackfilled ${updated} events. Skipped ${skipped} already-customized.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => process.exit(0))
