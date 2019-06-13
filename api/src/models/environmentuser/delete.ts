import { getPgPool } from "../../persistence/pg";

// userId, environmentId
export default async function deleteEnvUser(opts) {
  const q = "delete from environmentuser where user_id = $1 and environment_id = $2";
  const v = [opts.userId, opts.environmentId];
  const pg = await getPgPool();
  await pg.query(q, v);
}
