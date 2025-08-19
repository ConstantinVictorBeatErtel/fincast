import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// Simple in-memory user for local development
const users = [
  {
    id: '1',
    email: 'test@example.com',
    password: '$2a$10$example', // This won't be used in our simple setup
    name: 'Test User'
  }
];

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // For local development, accept any email/password combination
        if (credentials?.email && credentials?.password) {
          return {
            id: '1',
            email: credentials.email,
            name: credentials.email.split('@')[0] || 'User',
          };
        }
        return null;
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    signUp: '/auth/signup',
  }
});

export { handler as GET, handler as POST }; 