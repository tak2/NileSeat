import NextAuth, { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { prisma } from "../../../lib/prisma";

const tenantId = process.env.AZURE_AD_TENANT_ID;

const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!tenantId) return false;
      const profileTenant = (profile as Record<string, unknown> | null)?.tid as
        | string
        | undefined;
      const email =
        (profile as Record<string, unknown> | null)?.email as string | undefined;
      const preferredUsername =
        (profile as Record<string, unknown> | null)?.preferred_username as
          | string
          | undefined;
      const resolvedEmail = email ?? preferredUsername;
      if (!resolvedEmail) return false;
      return profileTenant === tenantId;
    },
    async jwt({ token, profile }) {
      const emailFromProfile =
        (profile as Record<string, unknown> | null)?.email as string | undefined;
      const preferredUsername =
        (profile as Record<string, unknown> | null)?.preferred_username as
          | string
          | undefined;
      const resolvedEmail = emailFromProfile ?? preferredUsername ?? token.email;
      const nameFromProfile =
        (profile as Record<string, unknown> | null)?.name as string | undefined;
      const profileTenant = (profile as Record<string, unknown> | null)?.tid as
        | string
        | undefined;

      if (resolvedEmail) {
        token.email = resolvedEmail.toLowerCase();
      }
      if (nameFromProfile) {
        token.name = nameFromProfile;
      }
      if (profileTenant) {
        token.tid = profileTenant;
      }

      if (token.email) {
        const admin = await prisma.admin.findUnique({
          where: { email: token.email },
        });
        token.role = admin ? "admin" : "user";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string | undefined;
        session.user.name = token.name as string | undefined;
        (session.user as Record<string, unknown>).role = token.role;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
