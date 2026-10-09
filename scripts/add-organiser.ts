/**
 * Create a login, or reset its PIN. Organisers can do everything; scorers only the live scorer.
 *
 *   npm run organiser:add -- "Name" 482913              (organiser)
 *   npm run organiser:add -- "Name" 482913 scorer       (scorer)
 *   npm run organiser:add -- "Name" disable
 *
 * Plain words, not --flags: PowerShell drops the "--" before npm, and npm then swallows --flags.
 * Use organiser:add:prod instead to write to the production database in .env.neon.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
/** Printed after each change so it's obvious whether local or production was touched. */
const dbHost = (process.env.DATABASE_URL ?? "local .env").replace(/^.*@/, "").replace(/[/?].*$/, "");

async function main() {
  const [name, pinOrFlag, roleArg = "organiser"] = process.argv.slice(2);
  if (!name || !pinOrFlag) {
    console.error('Usage: npm run organiser:add -- "Name" <pin> [organiser|scorer]   (or: "Name" disable)');
    process.exit(1);
  }

  if (pinOrFlag === "disable" || pinOrFlag === "--disable") {
    await prisma.organiser.update({ where: { name }, data: { active: false } });
    console.log(`Disabled ${name} on ${dbHost}.`);
    return;
  }

  if (!/^\d{6,}$/.test(pinOrFlag)) {
    console.error("PIN must be at least 6 digits.");
    process.exit(1);
  }
  if (roleArg !== "organiser" && roleArg !== "scorer") {
    console.error('Role must be "organiser" or "scorer".');
    process.exit(1);
  }
  const pinHash = await bcrypt.hash(pinOrFlag, 10);
  await prisma.organiser.upsert({
    where: { name },
    create: { name, pinHash, role: roleArg },
    update: { pinHash, active: true, role: roleArg },
  });
  console.log(`Saved ${roleArg} login for ${name} on ${dbHost}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
