import { getPgPool } from "../../persistence/pg";
import { EnterpriseToken } from "./";

/*
  opts:
    eitapiTokenId
*/

export interface Opts {
  eitapiTokenId: string;
}

export default async function getEitapiToken(opts: Opts): Promise<EnterpriseToken|null> {
  const pg = await getPgPool();
  const q = `
  select
    id, display_name, project_id, environment_id, group_id, view_log_action
  from
    eitapi_token
  where
    id = $1
  `;
  const result = await pg.query(q, [opts.eitapiTokenId]);
  if (result.rowCount === 1) {
    return result.rows[0];
  } else if (result.rowCount > 1) {
    throw new Error(`Expected row count of 1, got ${result.rowCount}`);
  }
  return null;
}
