/**
 * Create an organiser login, or reset their PIN.
 *
 *   npm run organiser:add -- "Name" 482913
 *   npm run organiser:add -- "Name" --disable
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [name, pinOrFlag] = process.argv.slice(2);
  if (!name || !pinOrFlag) {
    console.error('Usage: npm run organiser:add -- "Name" <pin>   (or --disable)');
    process.exit(1);
  }

  if (pinOrFlag === "--disable") {
    await prisma.organiser.update({ where: { name }, data: { active: false } });
    console.log(`Disabled ${name}.`);
    return;
  }

  if (!/^\d{6,}$/.test(pinOrFlag)) {
    console.error("PIN must be at least 6 digits.");
    process.exit(1);
  }
  const pinHash = await bcrypt.hash(pinOrFlag, 10);
  await prisma.organiser.upsert({
    where: { name },
    create: { name, pinHash },
    update: { pinHash, active: true },
  });
  console.log(`Saved login for ${name}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
