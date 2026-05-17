/**
 * One-off cleanup: delete specific Union records by id. Use for phantom
 * unions (e.g. a union whose two "spouses" aren't actually a couple).
 *
 * Usage: npx tsx scripts/delete-phantom-unions.ts <unionId> [unionId...]
 */
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const db = new PrismaClient()

async function main() {
  const ids = process.argv.slice(2)
  if (ids.length === 0) {
    console.error('usage: npx tsx scripts/delete-phantom-unions.ts <unionId> [unionId...]')
    process.exit(1)
  }

  for (const id of ids) {
    const union = await db.union.findUnique({ where: { id } })
    if (!union) {
      console.warn(`- skip: union ${id} not found`)
      continue
    }

    const detached = await db.treeNode.updateMany({
      where: { childOfUnionId: id },
      data: { childOfUnionId: null },
    })
    await db.union.delete({ where: { id } })
    console.log(
      `- deleted union ${id} (spouses ${union.spouseAId} / ${union.spouseBId ?? 'null'}); detached ${detached.count} child(ren)`
    )
  }

  console.log('done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
