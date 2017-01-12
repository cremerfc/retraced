import * as stringify from "csv-stringify";
import * as _ from "lodash";
import * as sanitizefn from "sanitize-filename";

import getPgPool from "../../persistence/pg";
import deepSearchEvents from "../event/deepSearch";
import getEventsBulk from "../event/getBulk";
import renderEvents from "../event/render";

const pgPool = getPgPool();

export default async function renderSavedExport(opts) {
  const { environmentId, projectId, teamId, savedExportId, format, source } = opts;

  const pg = await pgPool.connect();
  try {
    let q = `select name, body, version
      from saved_export
      where id = $1 and environment_id = $2 and project_id = $3`;
    const v = [savedExportId, environmentId, projectId];
    const result = await pg.query(q, v);
    if (!result.rows.length) {
      throw new Error(`No such saved export: id=${savedExportId}, envid=${environmentId}, projid=${projectId}`);
    }

    let queryDesc = JSON.parse(result.rows[0].body);
    let queryVersion = result.rows[0].version;
    let queryName = result.rows[0].name;
    let query;
    switch (queryVersion) {
      case 1:
        query = {
          create: queryDesc.showCreate || false,
          read: queryDesc.showRead || false,
          update: queryDesc.showUpdate || false,
          delete: queryDesc.showDelete || false,
        };
        if (queryDesc.searchQuery) {
          query.search_text = queryDesc.searchQuery;
        }
        if (queryDesc.startTime) {
          query.start_time = queryDesc.startTime;
        }
        if (queryDesc.endTime) {
          query.end_time = queryDesc.endTime;
        }
        break;

      default:
        throw new Error(`Unknown query descriptor version: ${queryVersion}`);
    }

    const index = `retraced.${projectId}.${environmentId}`;
    const results = await deepSearchEvents({
      index,
      team_id: teamId,
      query,
      fetchAll: true,
    });

    if (!results.total_hits) {
      return undefined;
    }

    const events = await getEventsBulk({
      project_id: projectId,
      environment_id: environmentId,
      event_ids: results.ids,
    });

    const fullEvents = await renderEvents({
      source: source,
      eventsIn: events,
      projectId: projectId,
      environmentId: environmentId,
    });

    // TODO(zhaytee): This might be a huge amount of data. Use the filesystem?
    let rendered;
    switch (format) {
      case "csv":
        rendered = await renderAsCSV(fullEvents);
        break;

      default:
        throw new Error(`Unknown rendering format: ${format}`);
    }

    const sanitized = sanitizefn(queryName).replace(/\s/g, "_");
    const filename = `${sanitized}.${format}`;

    return {
      filename,
      rendered,
    };

  } finally {
    pg.release();
  }
}

async function renderAsCSV(events) {
  const processing = new Promise((resolve, reject) => {
    let accum = "";
    const stringifier = stringify({ header: true });
    stringifier.on("readable", () => {
      let row = stringifier.read();
      while (row) {
        accum += row;
        row = stringifier.read();
      }
    });
    stringifier.on("error", err => reject);
    stringifier.on("finish", () => resolve(accum));

    for (const ev of events) {
      // Flatten and clean up.
      const flatActor = {};
      if (ev.actor) {
        for (const key of _.keys(ev.actor)) {
          if (key === "retraced_object_type" ||
            key === "foreign_id" ||
            key === "environment_id" ||
            key === "project_id" ||
            key === "id") {
            continue;
          }
          flatActor[`actor_${key}`] = ev.actor[key];
        }
      }
      const flatObject = {};
      if (ev.object) {
        for (const key of _.keys(ev.object)) {
          if (key === "retraced_object_type" ||
            key === "foreign_id" ||
            key === "environment_id" ||
            key === "project_id" ||
            key === "id") {
            continue;
          }
          flatObject[`object_${key}`] = ev.object[key];
        }
      }
      const result = Object.assign({}, ev, flatActor, flatObject);
      delete result.actor;
      delete result.object;
      delete result.object_id;
      delete result.actor_id;
      delete result.raw;
      stringifier.write(result);
    }
    stringifier.end();
  });

  return await processing;
}