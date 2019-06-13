import * as uuid from "uuid";
import Analytics from "analytics-node";
import * as moment from "moment";

import { getPgPool } from "../../persistence/pg";
import createApiToken from "../api_token/create";
import createEnvironment from "../environment/create";
import addUserToProject from "./addUser";
import { Environment } from "../environment";
import { ApiToken } from "../api_token";

/**
 * Asynchronously create a new project with the given options
 */
export default async function createProject(opts) {
  const pg = await getPgPool();
  const project = {
    id: opts.id || uuid.v4().replace(/-/g, ""),
    name: opts.name,
    created: moment().unix(),
    environments: getDefaultEnvironments(),
    tokens: [] as ApiToken[],
  };

  const q = `insert into project (id, created, name) values ($1, to_timestamp($2), $3)`;
  const v = [
    project.id,
    project.created,
    project.name,
  ];
  await pg.query(q, v);

  // Report this project as a user to segment
  if (process.env.SEGMENT_WRITE_KEY) {
    const analytics = new Analytics(process.env.SEGMENT_WRITE_KEY);
    analytics.identify({
      userId: project.id,
      traits: {
        name: project.name,
        createdAt: project.created,
      },
    });
  }

  const createEnvPromises = [] as Array<Promise<Environment>>;
  project.environments.forEach((environment) => {
    createEnvPromises.push(createEnvironment({
      name: environment.name,
      projectId: project.id,
    }));
  });

  await Promise.all(createEnvPromises)
    .then((envs) => {
      const createTokenPromises = [] as Array<Promise<ApiToken>>;
      project.environments = envs;
      project.environments.forEach((environment: Environment) => {
        const newApiToken = {
          name: `Default ${environment.name} Token`,
          disabled: false,
        };
        createTokenPromises.push(createApiToken(project.id, environment.id, newApiToken));
      });
      return Promise.all(createTokenPromises);
    })
    .then((newApiTokens) => {
      for (const t of newApiTokens) {
        project.tokens.push(t);
      }
      if (opts.user_id) {
        return addUserToProject({
          projectId: project.id,
          userId: opts.user_id,
        });
      }
  });

  return addUserToProject;
}

function getDefaultEnvironments() {
  return [
    {
      name: "Production",
    },
    {
      name: "Staging",
    },
  ];
}
