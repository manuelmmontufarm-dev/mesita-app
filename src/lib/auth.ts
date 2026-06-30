import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { validatePassword } from "@/lib/auth-utils";
import { z } from "zod";

// Define the expected session shape
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "OWNER" | "MANAGER" | "SERVER";
      restaurantId: string;
    };
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        console.log("[auth] authorize called, pwdLen:", String((credentials as any)?.password ?? "").length);
        const validatedCredentials = credentialsSchema.safeParse(credentials);

        if (!validatedCredentials.success) {
          return null;
        }

        const { email, password } = validatedCredentials.data;

        // Find user by email - note: email is globally unique in Phase 1
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            restaurantId: true,
            restaurant: { select: { status: true } },
          },
        });

        if (!user) {
          return null;
        }

        if (user.restaurant.status === "PENDING") {
          throw new Error("RESTAURANT_PENDING");
        }
        if (user.restaurant.status === "SUSPENDED") {
          throw new Error("RESTAURANT_SUSPENDED");
        }

        // Compare password using validatePassword utility
        const isPasswordValid = await validatePassword(password, user.password);
        console.log("[auth] password valid:", isPasswordValid);

        if (!isPasswordValid) {
          return null;
        }

        // Return user object matching session shape
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          restaurantId: user.restaurantId,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.restaurantId = (user as any).restaurantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "OWNER" | "MANAGER" | "SERVER";
        session.user.restaurantId = token.restaurantId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NODE_ENV === "development",
});
