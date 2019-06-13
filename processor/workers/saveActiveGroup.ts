import "source-map-support/register";

import { getPgPool } from "../persistence/pg";

export default async function saveActiveGroup(job) {
  const jobObj = JSON.parse(job.body);
  const groupId = jobObj.event.group && jobObj.event.group.id;

  if (!groupId) {
    return;
  }

  const q = `insert into active_group (
    created_at, project_id, environment_id, group_id
  ) values (
    to_timestamp($1::double precision / 1000), $2, $3, $4
  )`;
  const v = [
    jobObj.event.canonical_time,
    jobObj.projectId,
    jobObj.environmentId,
    groupId,
  ];
  const pg = await getPgPool();
  try {
    await pg.query(q, v);
  } catch (e) {
    e.retry = true;
    throw e;
  }
}
