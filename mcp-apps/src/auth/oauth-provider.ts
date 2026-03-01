import crypto from "node:crypto";
import { Response } from "express";
import { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

interface PendingAuth {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
}

interface StoredCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
}

interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

class YahooFantasyClientsStore implements OAuthRegisteredClientsStore {
  private clients: Map<string, OAuthClientInformationFull> = new Map();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    this.clients.set(client.client_id, client);
    return client;
  }
}

export class YahooFantasyOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new YahooFantasyClientsStore();
  private authCodes: Map<string, StoredCode> = new Map();
  private tokens: Map<string, StoredToken> = new Map();
  private pendingAuths: Map<string, PendingAuth> = new Map();
  private serverUrl: string;
  private password: string;

  constructor(serverUrl: string, password: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.password = password;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const state = params.state || crypto.randomBytes(16).toString("hex");
    this.pendingAuths.set(state, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes || [],
      resource: params.resource,
    });
    res.redirect(this.serverUrl + "/login?state=" + state);
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code");
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code");
    }
    if (stored.expiresAt < nowSeconds()) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }
    const token = "yf_" + crypto.randomBytes(32).toString("hex");
    this.tokens.set(token, {
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: nowSeconds() + 86400,
      resource: stored.resource,
    });
    this.authCodes.delete(authorizationCode);
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: 86400,
      scope: stored.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error("Refresh tokens not supported");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Master token bypass (using the password directly)
    if (token === this.password) {
      return {
        token,
        clientId: "master",
        scopes: ["baseclaw"],
        expiresAt: nowSeconds() + 31536000, // 1 year
      };
    }

    const stored = this.tokens.get(token);
    if (!stored) {
      throw new InvalidTokenError("Invalid token");
    }
    if (stored.expiresAt < nowSeconds()) {
      this.tokens.delete(token);
      throw new InvalidTokenError("Token expired");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt,
      resource: stored.resource,
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.tokens.delete(request.token);
  }

  handleLogin(state: string, password: string): string {
    const pending = this.pendingAuths.get(state);
    if (!pending) {
      throw new Error("Invalid state");
    }
    const a = Buffer.from(password);
    const b = Buffer.from(this.password);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("Wrong password");
    }
    const code = "yf_" + crypto.randomBytes(16).toString("hex");
    this.authCodes.set(code, {
      clientId: pending.clientId,
      codeChallenge: pending.codeChallenge,
      redirectUri: pending.redirectUri,
      scopes: pending.scopes,
      resource: pending.resource,
      expiresAt: nowSeconds() + 300,
    });
    this.pendingAuths.delete(state);
    const url = new URL(String(pending.redirectUri));
    url.searchParams.set("code", code);
    url.searchParams.set("state", state);
    return url.toString();
  }
}
