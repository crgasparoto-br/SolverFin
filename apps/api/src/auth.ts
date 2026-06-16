export type AuthUserStatus = "active" | "disabled";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  status: AuthUserStatus;
}

export interface AuthUserCredentials {
  user: AuthenticatedUser;
  passwordHash: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  session: AuthSession;
}

export interface AuthRequestHeaders {
  authorization?: string;
}

export interface AuthSessionStore {
  create(session: AuthSession): void;
  get(sessionId: string): AuthSession | undefined;
  delete(sessionId: string): void;
}

export type VerifyPassword = (input: { password: string; passwordHash: string }) => boolean;
export type SessionIdFactory = (user: AuthenticatedUser) => string;
export type AuthClock = () => Date;

export interface AuthServiceOptions {
  users: readonly AuthUserCredentials[];
  sessionStore?: AuthSessionStore;
  verifyPassword: VerifyPassword;
  createSessionId: SessionIdFactory;
  now?: AuthClock;
  sessionTtlMs?: number;
}

export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_SESSION_REQUIRED"
  | "AUTH_SESSION_INVALID"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_USER_DISABLED";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

export function createAuthService(options: AuthServiceOptions) {
  const sessionStore = options.sessionStore ?? createInMemoryAuthSessionStore();
  const now = options.now ?? (() => new Date());
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const usersByEmail = new Map(
    options.users.map((credentials) => [normalizeEmail(credentials.user.email), credentials]),
  );
  const usersById = new Map(
    options.users.map((credentials) => [credentials.user.id, credentials.user]),
  );

  function getAuthenticatedUser(sessionId: string): AuthenticatedUser {
    const session = sessionStore.get(sessionId);

    if (!session) {
      throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.");
    }

    if (session.expiresAt.getTime() <= now().getTime()) {
      sessionStore.delete(sessionId);
      throw new AuthError("AUTH_SESSION_EXPIRED", "Authentication session expired.");
    }

    const user = usersById.get(session.userId);

    if (!user) {
      throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.");
    }

    if (user.status !== "active") {
      throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
    }

    return user;
  }

  return {
    login(input: LoginInput): LoginResult {
      const credentials = usersByEmail.get(normalizeEmail(input.email));

      if (
        !credentials ||
        !options.verifyPassword({
          password: input.password,
          passwordHash: credentials.passwordHash,
        })
      ) {
        throw invalidCredentialsError();
      }

      if (credentials.user.status !== "active") {
        throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
      }

      const createdAt = now();
      const session: AuthSession = {
        id: options.createSessionId(credentials.user),
        userId: credentials.user.id,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + sessionTtlMs),
      };

      sessionStore.create(session);

      return {
        user: credentials.user,
        session,
      };
    },

    logout(sessionId: string): void {
      sessionStore.delete(sessionId);
    },

    getAuthenticatedUser,

    getOptionalAuthenticatedUser(sessionId: string | undefined): AuthenticatedUser | undefined {
      if (!sessionId) {
        return undefined;
      }

      return getAuthenticatedUser(sessionId);
    },

    requireAuthenticatedRequest(headers: AuthRequestHeaders): AuthenticatedUser {
      const sessionId = getBearerSessionId(headers.authorization);

      if (!sessionId) {
        throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.");
      }

      return getAuthenticatedUser(sessionId);
    },

    getOptionalAuthenticatedRequest(headers: AuthRequestHeaders): AuthenticatedUser | undefined {
      const sessionId = getBearerSessionId(headers.authorization);

      return sessionId ? getAuthenticatedUser(sessionId) : undefined;
    },
  };
}

export function createInMemoryAuthSessionStore(): AuthSessionStore {
  const sessions = new Map<string, AuthSession>();

  return {
    create(session: AuthSession): void {
      sessions.set(session.id, session);
    },

    get(sessionId: string): AuthSession | undefined {
      return sessions.get(sessionId);
    },

    delete(sessionId: string): void {
      sessions.delete(sessionId);
    },
  };
}

export function getBearerSessionId(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return undefined;
  }

  return token;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidCredentialsError(): AuthError {
  return new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
}
