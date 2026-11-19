import { userRepository } from "../repositories/user.repository.ts";
import type { PublicUser } from "../types/index.ts";
import { Errors } from "../utils/errors.ts";
import type {
  LoginInput,
  RegisterInput,
} from "../validators/auth.validator.ts";
import { tokenService } from "./token.service.ts";

// Verified against when the email doesn't exist, so response time doesn't reveal registered emails.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => {
  dummyHash ??= Bun.password.hash("citeverify-timing-equalizer");
  return dummyHash;
};

type AuthResult = { user: PublicUser; token: string };

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    if (await userRepository.findByEmail(input.email)) {
      throw Errors.conflict("An account with this email already exists");
    }
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash: await Bun.password.hash(input.password), // argon2id
    });
    return { user, token: await tokenService.issue(user.id) };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const record = await userRepository.findByEmail(input.email);
    const valid = await Bun.password.verify(
      input.password,
      record?.passwordHash ?? (await getDummyHash()),
    );
    if (!record || !valid) throw Errors.invalidCredentials();

    const { passwordHash: _omit, ...user } = record;
    return { user, token: await tokenService.issue(user.id) };
  },

  async me(userId: string): Promise<PublicUser> {
    const user = await userRepository.findPublicById(userId);
    // Token is valid but the account is gone (e.g. deleted): treat as unauthenticated.
    if (!user) throw Errors.unauthorized("Account no longer exists");
    return user;
  },
};
