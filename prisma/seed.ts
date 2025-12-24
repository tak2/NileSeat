import { DeskStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.AZURE_AD_TENANT_ID ?? "replace-with-tenant-id";
  const adminEmail = process.env.NILESEAT_ADMIN_EMAIL ?? "you@example.com";

  await prisma.tenant.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      domain: adminEmail.split("@")[1] ?? "example.com",
      displayName: "Primary Tenant",
    },
  });

  await prisma.admin.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: {
      email: adminEmail.toLowerCase(),
      displayName: "Seed Admin",
      addedBy: "seed",
    },
  });

  await prisma.desk.createMany({
    data: [
      {
        deskCode: "D-101",
        status: DeskStatus.Available,
        mapX: 0.20,
        mapY: 0.35,
        qrCodeValue: "desk/D-101",
      },
      {
        deskCode: "D-102",
        status: DeskStatus.Available,
        mapX: 0.45,
        mapY: 0.60,
        qrCodeValue: "desk/D-102",
      },
      {
        deskCode: "D-103",
        status: DeskStatus.Unavailable,
        mapX: 0.70,
        mapY: 0.25,
        qrCodeValue: "desk/D-103",
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
