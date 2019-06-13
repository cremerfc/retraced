import { getPgPool } from "../../persistence/pg";

export interface Options {
  targetIds: string[];
}

export default async function(opts: Options): Promise<any> {
  const pg = await getPgPool();
  const fields = `id, environment_id, event_count, foreign_id, name, project_id, url, type,
      extract(epoch from created) * 1000 as created,
      extract(epoch from first_active) * 1000 as first_active,
      extract(epoch from last_active) * 1000 as last_active`;

  const tokenList = opts.targetIds.map((a, i) => { return `$${i + 1}`; });
  const q = `select ${fields} from target where id in (${tokenList})`;
  const v = opts.targetIds;

  const result = await pg.query(q, v);

  if (result.rowCount > 0) {
    const targets: any = [];
    for (const row of result.rows) {
      targets.push(Object.assign({}, row, {
        retraced_object_type: "target",
      }));
    }
    return targets;
  }

  return [];
}
