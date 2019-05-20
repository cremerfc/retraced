import "source-map-support/register";
import * as uuid from "uuid";
import getEs from "../../persistence/elasticsearch";
import { getPgPool } from "../../persistence/pg";
import { Environment } from "./index";

const es = getEs();

interface Opts {
  name: string;
  projectId: string;

  id?: string;
};

export default async function createEnvironment(opts: Opts): Promise<Environment> {
  const environment = {
    id: opts.id || uuid.v4().replace(/-/g, ""),
    name: opts.name,
    projectId: opts.projectId,
  };

  if (!process.env.PG_SEARCH) {
      // Create the ES index
      const searchAlias = `retraced.${environment.projectId}.${environment.id}`;
      const writeAlias = `retraced.${environment.projectId}.${environment.id}.current`;
      const newIndex = `retraced.api.${uuid.v4().replace(/-/g, "")}`;
      const aliases = {};
      aliases[searchAlias] = {};
      aliases[writeAlias] = {};
      const params = {
        index: newIndex,
        body: {
          aliases,
        },
      };

      await es.indices.create(params);
  }

  const q = `insert into environment (
    id, name, project_id
  ) values (
    $1, $2, $3
  )`;
  const v = [
    environment.id,
    environment.name,
    environment.projectId,
  ];
  const pg = await getPgPool();
  await pg.query(q, v);

  return environment;
}