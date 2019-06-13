import * as _ from "lodash";
import * as bcrypt from "bcrypt";
import { instrument, instrumented } from "../../metrics";
import { AdminToken } from "./types";
import uuidNoDashes from "../uniqueId";
import { AdminClaims } from "../../security/vouchers";
import { logger } from "../../logger";
import { getPgPool } from "../../persistence/pg";

export class AdminTokenStore {

  public static default(): AdminTokenStore {
    if (AdminTokenStore.instance) {
      return AdminTokenStore.instance;
    }

    AdminTokenStore.instance = new AdminTokenStore(
      uuidNoDashes,
    );
    return AdminTokenStore.instance;
  }

  private static instance: AdminTokenStore;

  constructor(
    private readonly idSource: () => string,
  ) {
  }

  @instrumented
  public async createAdminToken(userId: string): Promise<AdminToken> {
    const id = this.idSource();
    const token = this.idSource();

    const tokenBcrypt = await instrument(
      "adminToken.bcrypt",
      () => bcrypt.hash(token, 12),
    );
    let created = new Date();

    const q = `
INSERT INTO admin_token (
  id,
  user_id,
  token_bcrypt,
  created
) VALUES ($1, $2, $3, $4)`;

    const v = [
      id,
      userId,
      tokenBcrypt,
      created,
    ];

    const pg = await getPgPool();
    await pg.query(q, v);

    return {
      id,
      userId,
      tokenBcrypt,
      token,
      disabled: false,
      createdAt: created,
    };
  }

  @instrumented
  public async verifyTokenOr401(id: string, plaintextToken: string): Promise<AdminClaims> {

    const q = `SELECT * FROM admin_token WHERE id = $1 AND disabled = FALSE`;

    const v = [
      id,
    ];

    const pg = await getPgPool();
    const res = await pg.query(q, v);
    if (_.isEmpty(res.rows)) {
      throw { status: 401, err: new Error("Invalid ID or token") };
    }

    const { user_id, token_bcrypt } = res.rows[0];

    const valid = await bcrypt.compare(plaintextToken, token_bcrypt);
    if (!valid) {
      logger.info(`token failed bcrypt compare; result was ${valid}`);
      throw { status: 401, err: new Error("Invalid ID or token") };
    }

    return {
      userId: user_id,
    };
  }
}
