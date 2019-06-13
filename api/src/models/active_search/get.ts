import { getPgPool } from "../../persistence/pg";

export interface Options {
  activeSearchId: string;
}

export default async function(opts: Options) {
  const pg = await getPgPool();
  let q = `
  select
    id, project_id, environment_id, group_id, saved_search_id, next_token, next_start_time
  from
    active_search
  where
    id = $1
  `;
  const result = await pg.query(q, [opts.activeSearchId]);
  if (result.rowCount === 1) {
    return result.rows[0];
  } else if (result.rowCount > 1) {
    throw new Error(`Expected row count of 1, got ${result.rowCount}`);
  }
  return null;
}
