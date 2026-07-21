/**
 * Production seed script - creates only the admin user.
 * Run ONCE after initial deployment:
 *   docker compose exec cortex npx tsx prisma/seed-production.mts
 *
 * Change the password immediately after first login.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.startsWith("postgresql")) {
  console.error("ERROR: DATABASE_URL must be a PostgreSQL connection string.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Production seed: creating admin user...");

  const existingAdmin = await prisma.user.findUnique({
    where: { email: "naveen@ryvanai.com" },
  });

  if (existingAdmin) {
    console.log("Admin user already exists. Skipping.");
    return;
  }

  const password = process.env.ADMIN_PASSWORD || randomUUID().slice(0, 16);
  const hashed = await hash(password, 12);

  await prisma.user.create({
    data: {
      email: "naveen@ryvanai.com",
      password: hashed,
      name: "Naveen Kumar",
      role: "admin",
      active: true,
    },
  });

  console.log("Admin user created:");
  console.log(`  Email:    naveen@ryvanai.com`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`  Password: ${password}`);
    console.log("  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN.");
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
