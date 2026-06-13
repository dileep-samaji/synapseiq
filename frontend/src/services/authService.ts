import { User, UserRole } from "../types";
import { delay } from "../utils/delay";
import { normalizeRole } from "../utils/roles";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SignupRequest extends LoginRequest {
  name: string;
  role: UserRole;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  verification_code?: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  password: string;
  confirm_password: string;
}

export const REGISTERED_USERS_KEY = "synapseiq.users";

interface StoredUser extends User {
  password: string;
}

function readUsers(): StoredUser[] {
  try {
    const storedUsers = localStorage.getItem(REGISTERED_USERS_KEY);
    if (!storedUsers) return [];
    const users = JSON.parse(storedUsers) as Array<Omit<StoredUser, "roles"> & { roles?: unknown[] }>;
    return users.map((user) => ({
      ...user,
      password: user.password ?? "",
      roles: [normalizeRole(user.roles?.[0])],
    }));
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
}

function toSafeUser(user: StoredUser): User {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
    roles: user.roles,
  };
}

export const authService = {
  login: async (payload: LoginRequest) => {
    const user = readUsers().find((item) => item.email.toLowerCase() === payload.email.toLowerCase());
    if (!user) {
      throw new Error("No account found for this email. Please sign up first.");
    }
    if (user.password !== payload.password) {
      throw new Error("Invalid email or password.");
    }

    const role = normalizeRole(user.roles[0]);
    return delay({ token: `local-token-${role.toLowerCase()}`, user: { ...toSafeUser(user), roles: [role] } });
  },

  signup: async (payload: SignupRequest) => {
    const users = readUsers();
    const existingUser = users.find((item) => item.email.toLowerCase() === payload.email.toLowerCase());
    if (existingUser) {
      throw new Error("An account already exists for this email. Please sign in.");
    }

    const role = normalizeRole(payload.role);
    const user: StoredUser = {
      id: `${role.toLowerCase()}-${Date.now()}`,
      email: payload.email,
      name: payload.name,
      password: payload.password,
      roles: [role],
    };

    writeUsers([user, ...users]);
    return delay({ token: `local-token-${role.toLowerCase()}`, user: toSafeUser(user) });
  },

  forgotPassword: async (payload: ForgotPasswordRequest) => {
    return delay({ message: `Verification code generated for ${payload.email}.`, verification_code: "246810" });
  },

  resetPassword: async (payload: ResetPasswordRequest) => {
    const users = readUsers();
    const nextUsers = users.map((user) =>
      user.email.toLowerCase() === payload.email.toLowerCase() ? { ...user, password: payload.password } : user,
    );
    writeUsers(nextUsers);
    return delay({ message: `Password reset for ${payload.email}.` });
  },

  me: async () => {
    const user = readUsers()[0];
    if (!user) throw new Error("No signed-up users found.");
    return delay<User>(toSafeUser(user));
  },
};
