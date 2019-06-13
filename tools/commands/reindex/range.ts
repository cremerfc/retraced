import * as chalk from "chalk";
import PostgresEventSource from "../../persistence/PostgresEventSource";
import { getPgPool } from "../../persistence/pg";
import common from "../../common";
import { logger } from "../../../logger";
import { makePageIndexer } from "./shared/page";
import searchES, { Options } from "../../../models/event/search";

const pgPool = getPgPool();

export const command = "range";
export const desc = "reindex a time range of events from postgres into elasticsearch";
export const builder = {
  projectId: {
    alias: "p",
  },
  environmentId: {
    alias: "e",
    demand: true,
  },
  elasticsearchNodes: {
    demand: true,
  },
  postgresUser: {
    demand: true,
  },
  postgresPort: {
    demand: true,
  },
  postgresDatabase: {
    demand: true,
  },
  postgresHost: {
    demand: true,
  },
  postgresPassword: {
    demand: true,
  },
  pageSize: {
    default: 5000,
  },
  startTime: {
    demand: true,
  },
  endTime: {
    demand: true,
  },
  dryRun: {
    default: false,
  },
};

export const handler = async (argv) => {
  const pg = await getPgPool();
  const pgPreResults = await pg.query("SELECT COUNT(1) FROM ingest_task WHERE $1::tsrange @> received", [`[${argv.startTime}, ${argv.endTime})`]);

  const esSearchOpts: Options  = {
    index: `retraced.${argv.projectId}.${argv.environmentId}`,
    startTime: new Date(argv.startTime).valueOf(),
    endTime: new Date(argv.endTime).valueOf(),
    length: 1,
    sort: "asc",
    groupOmitted: true,
    crud: {
      create: true,
      read: true,
      update: true,
      delete: true,
    },
  };
  const esPreResults = await searchES(esSearchOpts);

  console.log(chalk.yellow(`
    Reindexing time range: [${new Date(argv.startTime)}, ${new Date(argv.endTime)})
    Postgres source events in range: ${pgPreResults.rows[0].count}
    ElasticSearch destination events in range: ${esPreResults.totalHits} (approximate)
  `));

  logger.info({
    msg: "reindexing time range",
    startTime: argv.startTime,
    endTime: argv.endTime,
    postgresCount: pgPreResults.rows[0].count,
    elasticsearchCount: esPreResults.totalHits,
  });

  if (argv.dryRun) {
    console.log(chalk.yellow(`
    --dryRun was set, skipping range reindex`));
    process.exit(0);
  }

  const eventSource = new PostgresEventSource(argv.startTime, argv.endTime, argv.pageSize);
  const esTargetWriteIndex = `retraced.${argv.projectId}.${argv.environmentId}.current`;
  const eachPage = makePageIndexer(esTargetWriteIndex);

  await eventSource.iteratePaged(eachPage);
}
