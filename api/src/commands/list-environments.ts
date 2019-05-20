import * as util from "util";
import { getPgPool } from "../persistence/pg";

export const name = "list-environments";
export const describe = "list the current environments";
export const builder = {};

async function list(): Promise<any> {
  const pg = await getPgPool();
  return pg.query(`select * from environment`);
}

export const handler = async (argv) => {
  list()
    .then((res) => {
      console.log(`rows: ${util.inspect(res.rows)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.log(util.inspect(err));
      process.exit(1);
    });
};